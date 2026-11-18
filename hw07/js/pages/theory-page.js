/* theory-page.js — what independence means in a model and in data, what a wrong
   assumption of independence costs, where the expected counts R·C/N and the degrees
   of freedom come from, and why χ² has a known law. Static: no dock; the few plots
   are exact computations, nothing random. The full proofs are in the notes
   ([[Independence in probability]], [[Contingency tables and relative frequencies]],
   [[Maximum likelihood under independence]], [[Pearson chi-square test of independence]],
   note 03); only the ones that carry an idea are shown here, folded. */

import { el, explain, pageLink } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { table as dataTable } from '../../../assets/js/ui/lab.js';
import { plot, curve } from '../../../assets/js/ui/plot.js';
import { barChartWithLegend } from '../../../assets/js/ui/barchart.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { normCdf } from '../../../assets/js/core/numeric.js';
import { ContingencyTable } from '../core/table.js';
import { DEPARTMENTS } from '../../data/berkeley.js';
import { mosaic, legend, categoryColors, evidenceHtml, abstract, anchor, cellTable, INK, MUTED } from './widgets.js';
import { hw07Shell, PAGES, STICKY, MEMORY } from './shell.js';

const link = (href, text) => pageLink(PAGES, href, text);
const T = evidenceHtml('T'), S = evidenceHtml('S'), O = evidenceHtml('O');
const p = (html, cls = null) => el('p', { class: cls, html });
const card = (title, kids) => el('div', { class: 'card' }, [el('h2', { text: title }), ...kids]);
const h3 = (text) => el('h3', { class: 'panel-title', text });
const disp = (tex) => el('div', { class: 'eq', html: M`${tex}` });
const proof = (paras) => explain(paras, 'Proof');
const caption = (html) => p(html, 'small muted');

/* ---------- 1 · probability ---------- */

/** Y = X²: three equally likely points on a parabola; the best straight line through them is flat. */
function squarePlot() {
  return plot({
    x: { min: -1.5, max: 1.5, title: 'x', ticks: [-1, 0, 1] }, y: { min: -0.25, max: 1.35, title: 'y = x²', ticks: [0, 1] }, width: 380, height: 230,
    layers: [
      { type: 'line', points: curve((x) => x * x, -1.15, 1.15, 80), color: MUTED, dash: '2 3', label: 'y = x²' },
      { type: 'hline', at: 2 / 3, color: 'var(--s2)', text: 'best straight line: slope 0' },
      { type: 'points', points: [[-1, 1], [0, 0], [1, 1]], color: 'var(--s1)', r: 7, label: 'the three values, ⅓ each' },
    ],
    label: 'the points (−1, 1), (0, 0) and (1, 1), each with probability one third, on the parabola y = x squared; the least-squares line through them is horizontal at y = 2/3',
  });
}

/** XOR: Z against X alone (the splits line up) and Z against the pair (X, Y) (each column one colour). */
function xorMosaics() {
  const z = ['z = 0', 'z = 1'];
  const alone = ContingencyTable.fromCounts(['x = 0', 'x = 1'], z, [[1, 1], [1, 1]]);
  const pair = ContingencyTable.fromCounts(['00', '01', '10', '11'], z, [[1, 0], [0, 1], [0, 1], [1, 0]]);
  const colors = categoryColors(2);
  return el('div', {}, [
    el('div', { class: 'cols' }, [
      el('div', {}, [h3('Z against X alone'), mosaic({ table: alone, marginLine: true, width: 300, height: 200, label: 'mosaic of Z against X: both columns split 50–50, independent' })]),
      el('div', {}, [h3('Z against the pair (X, Y)'), mosaic({ table: pair, width: 300, height: 200, label: 'mosaic of Z against the pair X, Y: each column is entirely z = 0 or entirely z = 1' })]),
    ]),
    legend([['bar', colors[0], 'z = 0'], ['bar', colors[1], 'z = 1'], ['dash', 'var(--c-third)', 'split under independence']]),
  ]);
}

function probability() {
  return card('Independence in probability: learning one tells nothing about the other', [
    disp('X \\perp Y \\iff P(X = x,\\ Y = y) = P(X = x)\\,P(Y = y) \\quad \\text{for all } x, y'),
    p(`Equivalently ${T}, whenever ${m`P(X = x) > 0`}: ${m`P(Y = y \mid X = x) = P(Y = y)`}. Knowing ${m`X`} does not change what we expect of ${m`Y`}: <strong>the distribution of Y is the same in every row</strong>. This conditional form is the one the tables and mosaics of these pages show.`),
    proof([`${m`P(Y = y \mid X = x) = P(X = x, Y = y) / P(X = x)`}, and this equals ${m`P(Y = y)`} exactly when the joint probability is the product. ∎`]),
    p(`Functions of independent variables are independent ${T}, so cutting numbers into bins cannot create a dependence: one seen in a binned table is real. Binning can hide one, though.`, 'small muted'),
    h3('Trap 1 · Uncorrelated is not independent'),
    el('div', { class: 'cols' }, [
      el('div', {}, [
        p('The covariance, and its scaled version the correlation, measure how well a <em>straight line</em> fits the pairs:'),
        disp('\\operatorname{Cov}(X, Y) &= \\mathbb{E}[(X - \\mathbb{E}X)(Y - \\mathbb{E}Y)] = \\mathbb{E}[XY] - \\mathbb{E}[X]\\,\\mathbb{E}[Y] \\\\ \\rho &= \\frac{\\operatorname{Cov}(X, Y)}{\\sigma_X\\, \\sigma_Y}'),
        p(`Take ${m`X`} uniform on ${m`\{-1, 0, 1\}`} and ${m`Y = X^2`}. Then ${m`\mathbb{E}[X] = 0`} and ${m`\mathbb{E}[XY] = \mathbb{E}[X^3] = \tfrac{1}{3}(-1 + 0 + 1) = 0`}, so`),
        disp('\\operatorname{Cov}(X, Y) = 0 - 0 \\cdot \\mathbb{E}[Y] = 0.'),
        p(`Yet ${m`Y`} is a function of ${m`X`}: ${m`P(Y = 0 \mid X = 0) = 1`}, while ${m`P(Y = 0) = \tfrac{1}{3}`}. The pattern is a parabola, and the best straight line through it is flat. Independence implies zero covariance ${T}; the converse fails. A contingency table sees any pattern — try it in the ${link('procedure.html?dataset=square', 'procedure')} (dataset “Y = X²”).`),
      ]),
      el('div', {}, [squarePlot(), caption('Three equally likely values. The least-squares line has slope Cov/Var(X) = 0: correlation reports “no relation” for a perfect one.')]),
    ]),
    h3('Trap 2 · Pairwise is not mutual'),
    el('div', {}, [
      el('div', {}, [
        p(`${m`X, Y`} independent fair bits, and ${m`Z = X \oplus Y`} (their XOR). Fix ${m`X = x`}: ${m`Z = x \oplus Y`} is still a fair bit, so ${m`Z \perp X`}; likewise ${m`Z \perp Y`}. Every pair is independent — the left mosaic splits 50–50 in both columns. But the pair ${m`(X, Y)`} fixes ${m`Z`} completely: on the right, every column is a single colour. ${T}`),
      ]),
      xorMosaics(),
      p('This is 2-out-of-2 secret sharing: each share alone is independent of the secret, both together reveal it. Checking variables two at a time is not enough.', 'small muted'),
    ]),
  ]);
}

/* ---------- 2 · what a wrong assumption costs ---------- */

/** What an attacker believes about a 2-bit secret before and after one observation. */
function leakCharts() {
  const cats = ['00', '01', '10', '11'], prior = [0.25, 0.25, 0.25, 0.25];
  const chart = (values, label) => barChartWithLegend({
    categories: cats, xTitle: 'secret s', yTitle: 'probability', width: 340, height: 200,
    series: [{ label, color: 'var(--s1)', values }],
    overlay: { label: 'before: P(S = s)', color: 'var(--s2)', values: prior, dots: true },
  });
  return el('div', { class: 'cols' }, [
    el('div', {}, [h3('O = S ⊕ K, with a fresh random key K'), chart([0.25, 0.25, 0.25, 0.25], 'after seeing O = 01'), caption('Whatever is observed, all four secrets stay equally likely: nothing learned, I(S; O) = 0.')]),
    el('div', {}, [h3('O = the number of 1 bits of S'), chart([0, 0.5, 0.5, 0], 'after seeing O = 1'), caption('The observation rules out 00 and 11. On average it removes 1.5 of the 2 bits of uncertainty.')]),
  ]);
}

/** The real coverage of a nominal 95 % interval x̄ ± 1.96 σ/√n when each draw is correlated ρ with the previous one. */
function coveragePlot() {
  const cover = (r) => 2 * normCdf(1.96 / Math.sqrt((1 + r) / (1 - r))) - 1;
  return plot({
    x: { min: 0, max: 0.9, title: 'correlation ρ between consecutive draws' }, y: { min: 0, max: 1, title: 'real coverage' }, width: 420, height: 230,
    layers: [
      { type: 'hline', at: 0.95, dash: true, color: MUTED, text: 'promised: 95 %', anchor: 'start' },
      { type: 'line', points: curve(cover, 0, 0.9, 90), color: INK, label: 'real coverage of x̄ ± 1.96 σ/√n' },
      { type: 'points', points: [[0.5, cover(0.5)]], color: 'var(--s2)', r: 5 },
      { type: 'vline', at: 0.5, dash: true, color: 'var(--s2)' },
    ],
    label: 'the real coverage of a nominal 95 percent confidence interval falls as the correlation between consecutive draws grows: 74 percent at rho 0.5',
  });
}

function cost() {
  return card('What a wrong assumption of independence costs', [
    p('In every earlier homework independence was put into the model, not checked: the bits of a seed, the key of a cipher, the steps of a walk, the samples of a mean. When the assumption is false, two different things go wrong.'),

    h3('1 · The secret leaks'),
    p('Security definitions are independence statements. An observation O (a ciphertext, a power trace, a timing) is safe for a secret S when seeing it does not change what an attacker believes about S. Step by step:'),
    disp('\\text{O reveals nothing about S} &\\iff P(S = s \\mid O = o) = P(S = s) \\ \\text{ for all } s, o \\\\ &\\iff S \\perp O \\qquad \\text{(the conditional form above)} \\\\ &\\iff I(S; O) = H(S) - H(S \\mid O) = 0'),
    p(`${m`H(S)`} is the uncertainty about the secret before, in bits; ${m`H(S \mid O)`} what remains after the observation, on average; their difference, the <em>mutual information</em>, is what the observation taught. It is zero exactly when ${m`S \perp O`} ${T}. Shannon’s perfect secrecy is the first line with ${m`S`} the message and ${m`O`} the ciphertext. <strong>So leakage is dependence</strong>, and its size can be counted in bits. An example with a 2-bit secret, ${m`H(S) = 2`} bits:`),
    leakCharts(),
    p(`On the right: ${m`O = 0`} or ${m`2`} (probability ¼ each) reveal the secret, ${m`O = 1`} (probability ½) leaves two candidates, so ${m`H(S \mid O) = \tfrac{1}{4} \cdot 0 + \tfrac{1}{2} \cdot 1 + \tfrac{1}{4} \cdot 0 = 0.5`} bit and ${m`I(S; O) = 2 - 0.5 = 1.5`} bits leaked — with no attack beyond reading the observation. A power trace that follows the number of 1 bits is exactly this (${link('side-channels.html', 'side channels')}).`),

    h3('2 · The error bars lie'),
    p('Every error bar of HW4–HW6 is σ/√n, and that formula adds variances, which needs independence. Step by step:'),
    disp('\\operatorname{Var}(X_1 + X_2) &= \\operatorname{Var} X_1 + \\operatorname{Var} X_2 + 2\\operatorname{Cov}(X_1, X_2) \\\\ \\operatorname{Var}(\\bar x) &= \\frac{\\sigma^2}{n} \\quad \\text{(independent: every covariance is 0)} \\\\ \\operatorname{Var}(\\bar x) &\\approx \\frac{\\sigma^2}{n}\\Big(1 + 2\\sum_{k \\ge 1} \\rho_k\\Big) \\quad \\text{(draws k apart correlated } \\rho_k)'),
    el('div', { class: 'cols' }, [
      el('div', {}, [
        p(`An example: each draw is correlated ${m`\rho`} with the previous one, so ${m`\rho_k = \rho^k`} and the bracket sums to ${m`(1 + \rho)/(1 - \rho)`}. With ${m`\rho = 0.5`} it is 3: the true standard error is ${m`\sqrt 3 \approx 1.73`} times the reported one. The “95 %” interval ${m`\bar x \pm 1.96\,\sigma/\sqrt n`} then contains the true mean only when ${m`|Z| \le 1.96/\sqrt 3 = 1.13`}, that is <strong>74 % of the time</strong>.`),
        p('Nobody attacked anything: the analysis deceived itself. Positive correlation — a drifting sensor, a persistent attacker, a weak generator — always makes the reported uncertainty too small.', 'small'),
      ]),
      el('div', {}, [coveragePlot(), caption('What the promised 95 % interval really delivers as the correlation between consecutive draws grows. Orange: ρ = 0.5, real coverage 74 %.')]),
    ]),

    h3('Where it happened'),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data words prose wrap' }, [
      el('thead', {}, [el('tr', {}, ['where', 'assumed independent', 'when it is not, what is lost'].map((h, i) => el('th', { class: i ? null : 'left', text: h })))]),
      el('tbody', {}, [
        ['HW2 · seed', 'the 128–256 bits of a wallet seed', `bits derived from 32 bits of clock time: the key space shrinks from ${m`2^{128}`} to ${m`2^{32}`} and keys are found by search (Milk Sad, 2023 ${S})`],
        ['HW3 · ciphers', 'the ciphertext and the message', `Caesar keeps letter frequencies; a pad or an ElGamal ${m`k`} used twice turns two ciphertexts into ${m`m_1 \oplus m_2`} or ${m`m_1 / m_2`} (Venona ${S})`],
        ['signatures', `the nonce ${m`k`}, between signatures`, `a repeated or slightly biased ${m`k`} gives away the private key (PlayStation 3, 2010 ${S}; HW6’s lattices)`],
        ['HW4–HW6', 'the steps, the samples, the draws', 'correlated draws: error bars too narrow, a biased Monte Carlo integral'],
        ['side channels', 'the power trace and the key', `the trace follows the data processed: the key leaks a few bits at a time (${link('side-channels.html', 'side channels')})`],
      ].map((r) => el('tr', {}, r.map((c, i) => el('td', { class: i ? null : 'left', html: c }))))),
    ])]),
    p(`Hence the two uses of a test of independence on these pages: a <strong>leak detector</strong> (${link('generators.html', 'random generators')}, ${link('side-channels.html', 'side channels')}) and a check on our own assumptions. Its limit is the same in both: it sees only the dependence it looks at, so passing it is not a proof of security. ${O}`, 'small'),
  ]);
}

/* ---------- 3 · statistics ---------- */

/** The exact law of the gap between two observed rates when both groups share the true rate 40 %. */
function gapPlot() {
  const n = 100, q = 0.4;
  const binom = [];
  let lp = n * Math.log(1 - q);
  for (let k = 0; k <= n; k++) { binom.push(Math.exp(lp)); lp += Math.log((n - k) / (k + 1)) + Math.log(q / (1 - q)); }
  const gap = new Map();   // the gap k1 − k2 in records = percentage points (100 records per group)
  for (let a = 0; a <= n; a++) for (let b = 0; b <= n; b++) gap.set(a - b, (gap.get(a - b) ?? 0) + binom[a] * binom[b]);
  const se = 100 * Math.sqrt((2 * q * (1 - q)) / n), lim = 1.96 * se;
  let inside = 0;
  for (const [d, pr] of gap) if (Math.abs(d) <= lim) inside += pr;
  const bars = [...gap].filter(([d]) => Math.abs(d) <= 30).map(([d, pr]) => [d - 0.5, d + 0.5, pr]);
  const node = plot({
    x: { min: -30, max: 30, title: 'observed gap between the two rates (percentage points)' }, y: { min: 0, title: 'probability' }, width: 460, height: 230,
    layers: [
      { type: 'shade', x0: -lim, x1: lim, color: 'var(--s1)' },
      { type: 'bars', bars, color: 'var(--s1)', label: 'law of the gap under independence' },
      { type: 'vline', at: 20, color: 'var(--s2)', text: 'a gap of 20' },
      { type: 'vline', at: 2, dash: true, color: MUTED, text: 'a gap of 2' },
    ],
    label: `the exact distribution of the difference between two observed rates, 100 records each, true rate 40 percent in both: ${(100 * inside).toFixed(0)} percent of the gaps lie within plus or minus ${lim.toFixed(1)} points`,
  });
  return { node, lim, inside };
}

function statistics() {
  const g = gapPlot();
  return card('Independence in statistics: a decision about data', [
    el('div', { class: 'cols' }, [
      el('div', {}, [
        h3('In probability: a property of a model'),
        disp('p_{ij} = p_{i\\cdot}\\, p_{\\cdot j} \\quad \\text{exactly}'),
        p('The probabilities are given; the statement is simply true or false.', 'small'),
      ]),
      el('div', {}, [
        h3('In statistics: a question about counts'),
        disp('O_{ij} \\approx E_{ij} = \\frac{R_i\\, C_j}{N} \\ ?'),
        p(`The probabilities are unknown; we see counts ${m`O_{ij}`} from a sample. The exact twin of independence on data is ${m`O_{ij} = E_{ij}`} in every cell, which is the same as “every row has the same profile” ${T}.`, 'small'),
      ]),
    ]),
    proof([`If every row has the same profile ${m`q_j`}, the column margin — the average of the rows weighted by their size, ${m`C_j/N = \sum_i (R_i/N)(O_{ij}/R_i)`} — is ${m`q_j`} too, so ${m`O_{ij} = R_i q_j = R_i C_j / N`}. Conversely ${m`O_{ij} = R_i C_j/N`} gives every row the profile ${m`C_j/N`}. ∎`]),
    h3('But data never satisfy it exactly'),
    el('div', { class: 'cols wide-first' }, [
      el('div', {}, [g.node]),
      el('div', {}, [
        p(`Two groups of 100, with the <em>same</em> true rate, 40 %: the variables are independent. The observed rates still differ, by chance: ${(100 * g.inside).toFixed(0)} % of the time by up to <strong>±${g.lim.toFixed(1)} points</strong> (tinted). So the question is never “are the profiles equal?” but <strong>“do they differ by more than chance would make them?”</strong>`),
        p('A gap of 2 points is well inside: no evidence of dependence. A gap of 20 points almost never happens under independence: evidence of dependence. The χ² test does this for any table, measuring the gap in units of its chance size.', 'small'),
      ]),
    ]),
    h3('A decision can go wrong in two ways'),
    dataTable(['', 'decide “no evidence”', 'decide “dependent”'], [
      ['truly independent', 'right', 'false alarm: probability α (you choose it, e.g. 5 %)'],
      ['truly dependent', 'missed: probability β', 'right: the power 1 − β, which grows with N and with the effect'],
    ], 'words prose wrap'),
    h3('So, when reading a result'),
    el('ol', { class: 'steps' }, [
      '<strong>Reject</strong> → “evidence of dependence (association)”. Then say how strong (Cramér’s V, bits) and where (residuals), never only the p-value.',
      `<strong>Do not reject</strong> → “no evidence at this sample size”, never “proved independent”: a test can contradict independence, never confirm it ${O}. Say what effect the test could have seen (its power).`,
      '<strong>Large N</strong> → everything becomes significant; the strength decides whether it matters.',
    ].map((h) => el('li', { html: h }))),
    caption(`Two more rules are the subject of other pages: conditioning can create or remove a dependence (${link('berkeley.html', 'Berkeley 1973')}, ${link('causality.html', 'causality')}); and the traps above say which dependence a check can miss.`),
  ]);
}

/* ---------- 4 · expected counts and degrees of freedom ---------- */

function freeGrid() {
  const r = 3, c = 4;
  const t = el('table', { class: 'data ct grid-demo', 'aria-label': 'a 3 by 4 table: the 6 cells of the first 2 rows and 3 columns are free, the others forced by the margins' }, [
    el('thead', {}, [el('tr', {}, [el('th', { class: 'left', text: '' }), ...Array.from({ length: c }, (_, j) => el('th', { text: `F${j + 1}` })), el('th', { class: 'margin', text: 'total' })])]),
    el('tbody', {}, [
      ...Array.from({ length: r }, (_, i) => el('tr', {}, [el('th', { class: 'left', text: `X${i + 1}` }),
        ...Array.from({ length: c }, (_, j) => (i < r - 1 && j < c - 1 ? el('td', { class: 'free', text: 'free' }) : el('td', { class: 'forced', text: 'forced' }))),
        el('td', { class: 'margin', html: m`R_${i + 1}` })])),
      el('tr', { class: 'margin-row' }, [el('th', { class: 'left margin', text: 'total' }), ...Array.from({ length: c }, (_, j) => el('td', { class: 'margin', html: m`C_${j + 1}` })), el('td', { class: 'margin', html: m`N` })]),
    ]),
  ]);
  return el('div', { class: 'scroll-x' }, [t]);
}

function expected() {
  const sum = (k) => DEPARTMENTS.reduce((s, d) => s + d.counts[k], 0);
  const t = ContingencyTable.fromCounts(['men', 'women'], ['admitted', 'rejected'], [[sum(0), sum(1)], [sum(2), sum(3)]]);
  const R = t.R, C = t.C, N = t.N, E = t.expected(), rate = C[0] / N;
  const fmt = (v) => v.toLocaleString('en-US').replace(/,/g, ' ');
  const free = t.at(0, 0);
  return card('Where the expected counts R·C/N come from', [
    p(`<strong>The question.</strong> If ${m`X`} and ${m`F`} were independent, how many of the ${m`N`} records would we expect in cell ${m`(i, j)`}?`),
    p(`<strong>The answer in three steps.</strong> (1) Under independence the probability of the cell is a product, ${m`P(X = i)\,P(F = j)`}. (2) We do not know these probabilities, so we estimate each from its margin: ${m`R_i / N`} and ${m`C_j / N`}. (3) The expected count is ${m`N`} times the probability:`),
    disp('E_{ij} = N \\cdot \\frac{R_i}{N} \\cdot \\frac{C_j}{N} = R_i \\cdot \\frac{C_j}{N}'),
    p('In words: <strong>the row total times the overall share of the column</strong>.', 'small'),
    h3('On Berkeley’s pooled table'),
    el('div', { class: 'cols' }, [
      el('div', {}, [
        p(`Overall, ${fmt(C[0])} of ${fmt(N)} applicants were admitted: <strong>${(100 * rate).toFixed(1)} %</strong>. If gender made no difference, ${(100 * rate).toFixed(1)} % of the ${fmt(R[0])} men would be admitted:`),
        disp(`E_{\\text{men, admitted}} = ${R[0]} \\times \\frac{${C[0]}}{${N}} = ${E[0][0].toFixed(1)}`),
        p(`${fmt(t.at(0, 0))} were: ${(t.at(0, 0) - E[0][0]).toFixed(1)} more than independence predicts. The other three cells the same way:`, 'small'),
      ]),
      el('div', {}, [cellTable({ table: t, cell: (i, j) => ({ text: `${fmt(t.at(i, j))} vs ${E[i][j].toFixed(1)}`, title: `${R[i]} × ${C[j]} / ${N}` }), rowMargin: (i) => fmt(R[i]), colMargin: (j) => fmt(C[j]), corner: fmt(N), label: 'observed versus expected counts, Berkeley pooled' }),
        caption('Each cell: observed vs expected. The expected table has exactly the same margins as the observed one.')]),
    ]),
    p(`<strong>Why the margins, and not some other estimate?</strong> Among all tables that satisfy independence, the one built from the observed margins is the one under which the observed data are most likely: ${m`E_{ij}`} is the maximum-likelihood fit ${T}. It is the independent table closest to the data, so whatever separates ${m`O`} from ${m`E`} is the dependence and nothing else.`, 'small'),
    proof([`The log-likelihood of the counts under ${m`p_{ij} = a_i b_j`} splits into two separate sums, ${m`\sum_i R_i \ln a_i + \sum_j C_j \ln b_j`}. Each has the form ${m`\sum_k n_k \ln q_k`} over a probability vector ${m`q`}, which is largest at ${m`q_k = n_k / \sum n`} (Gibbs’ inequality, from ${m`\ln t \le t - 1`}). So ${m`\hat a_i = R_i / N`} and ${m`\hat b_j = C_j / N`}. ∎ Full proof: the note “Maximum likelihood under independence”.`]),
    h3('Degrees of freedom: how many cells can still move?'),
    el('div', { class: 'cols wide-first' }, [
      el('div', {}, [
        p(`Keep the margins fixed and ask how many counts you could still choose. In the 2 × 2 table, choose “men admitted” = ${fmt(free)}; the margins force the other three:`),
        disp(`\\text{men rejected} &= ${R[0]} - ${free} \\\\ \\text{women admitted} &= ${C[0]} - ${free} \\\\ \\text{women rejected} &= ${N} - ${R[0]} - ${C[0]} + ${free}`),
        p(`One free cell: <strong>1 degree of freedom</strong>. In general the first ${m`r - 1`} rows and ${m`c - 1`} columns are free and the last row and column are forced by the totals (grid on the right), so`),
        disp('\\text{df} = (r - 1)(c - 1),'),
        p('the number of independent ways the table can depart from independence. It sets which χ² curve the statistic is compared with.', 'small'),
      ]),
      el('div', {}, [freeGrid(), caption(`A 3 × 4 table: ${m`(3 - 1)(4 - 1) = 6`} free cells.`)]),
    ]),
  ]);
}

/* ---------- 5 · the law of χ² ---------- */

function chiLaw() {
  return card('Why χ² has a known law under independence', [
    disp('\\chi^2 = \\sum_{ij} \\frac{(O_{ij} - E_{ij})^2}{E_{ij}}'),
    p(`Each term compares a gap with the size chance gives it: a count expected to be ${m`E`} fluctuates by about ${m`\sqrt E`}, so ${m`(O - E)/\sqrt E`} is roughly a standard normal, and χ² adds up the squares of the ${m`(r - 1)(c - 1)`} that are free (the gaps sum to zero along every row and column, so the rest are forced).`),
    p(`<strong>The simplest case, proved</strong> ${T}: two categories with known ${m`p`}, ${m`O_1 \sim \text{Binomial}(N, p)`}, ${m`O_2 = N - O_1`}. Then χ² is exactly the square of the standardised count:`),
    disp('\\chi^2 = Z^2, \\qquad Z = \\frac{O_1 - Np}{\\sqrt{Np(1 - p)}} \\to N(0, 1), \\qquad \\text{so } \\chi^2 \\to \\chi^2_1.'),
    proof([`${m`O_2 - N(1 - p) = -(O_1 - Np)`}, so ${M`\chi^2 &= (O_1 - Np)^2 \Big(\frac{1}{Np} + \frac{1}{N(1 - p)}\Big) \\ &= \frac{(O_1 - Np)^2}{Np(1 - p)} = Z^2.`} ${m`Z \to N(0, 1)`} by de Moivre–Laplace (HW4’s CLT), and squaring is continuous. ∎`]),
    p(`<strong>The general case</strong> ${S}: under independence, ${m`\chi^2 \to \chi^2_{(r-1)(c-1)}`} as ${m`N \to \infty`} (Pearson 1900; the degrees of freedom corrected by Fisher 1922). Two consequences used on the other pages, proved in the notes: for a 2 × 2 table ${m`\chi^2 = N\varphi^2`}, with ${m`\varphi`} the correlation of the two 0/1 variables; and ${m`\chi^2 \le N(\min(r, c) - 1)`}, so Cramér’s ${m`V`} lies between 0 and 1.`),
    caption(`The approximation needs expected counts that are not too small (a rule of thumb ${S}: all ${m`E \ge 5`}, or at most 20 % below 5 and none below 1; the ${link('procedure.html', 'procedure')} page checks it) and independent records, each unit counted once — a property of how the data were collected, which no formula can check.`),
  ]);
}

startPage({
  shell: hw07Shell('theory.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: () => [
    abstract({
      question: 'What does “independent” mean for a probability model, and what can it mean for a finite table of counts? What does wrongly assuming it cost, and where do the expected counts of the test come from?',
      findings: [
        `<strong>One definition, two readings.</strong> ${m`P(X, Y) = P(X)\,P(Y)`} is the same as “the distribution of Y is the same for every X”. Zero correlation and pairwise independence are weaker: Y = X² and the XOR of two bits fool both.`,
        '<strong>Leakage is dependence.</strong> An observation reveals nothing about a secret exactly when the two are independent; observing the number of 1 bits of a 2-bit secret leaks 1.5 bits. And with correlated draws a “95 %” interval covers only 74 % of the time (ρ = 0.5).',
        '<strong>Data never show exact independence.</strong> Two groups with the same true rate differ by up to ±13.6 points by chance; the test asks whether a gap is larger than that.',
        `<strong>E = R·C/N</strong> is the row total times the overall column share — 1043.5 admitted men expected at Berkeley, 1198 observed — and ${m`(r - 1)(c - 1)`} counts the cells the margins leave free.`,
      ],
      sections: [['probability', 'Probability'], ['cost', 'What a wrong assumption costs'], ['statistics', 'Statistics'], ['expected', 'Expected counts and df'], ['law', 'The law of χ²']],
    }),
    anchor('probability', probability()), anchor('cost', cost()), anchor('statistics', statistics()),
    anchor('expected', expected()), anchor('law', chiLaw()),
  ],
});
