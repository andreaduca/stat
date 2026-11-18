/* procedure-page.js — the assignment as a procedure (note 01 §1), on any dataset, in
   four cards: the table read step by step (E1), the test and the decision (E2), the
   table filling as the records arrive (E3, one of the two animations of hw07), and
   what the test could have detected (E4). Few concepts, each with a worked number
   from the data on screen. The dataset and α are in the dock; a CSV is read in the
   browser and kept in this module only (never in the URL, never stored). */

import { el, pageLink, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table as dataTable } from '../../../assets/js/ui/lab.js';
import { plot, curve } from '../../../assets/js/ui/plot.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { nice, pct, sup } from '../../../assets/js/ui/format.js';
import { show, onCommit } from '../../../assets/js/ui/dock.js';
import { chi2Pdf, chi2Inv } from '../../../assets/js/core/numeric.js';
import { lnGamma } from '../../../assets/js/core/stats.js';
import { ContingencyTable } from '../core/table.js';
import { chiSquare, chi2Tail, effectSizes, power, sampleSize, detectableW } from '../core/tests.js';
import { parseCSV, pairsFrom } from '../core/csv.js';
import { pText, resultTriple, strengthWord } from '../core/interpret.js';
import { DATASETS, berkeley, generator, square, fromCSV, tableOf, extend, MAX_LEVELS } from '../core/datasets.js';
import { readInputs, readAlpha, dock, rejected } from './inputs.js';
import { mosaic, legend, categoryColors, abstract, anchor, viewSwitch, cellTable, residualCell, validityBadge, evidenceHtml, INK, MUTED } from './widgets.js';
import { hw07Shell, PAGES, STICKY, MEMORY } from './shell.js';

const link = (href, text) => pageLink(PAGES, href, text);
const HW = 'hw07';
const thin = (n) => nice(n);
const pc1 = (x) => pct(x, 1);
const num = (x, d = 2) => x.toFixed(d);

/** A small key under a formula: what each symbol stands for. @param {[string, string][]} items [TeX, meaning] */
const symbols = (items) => el('div', { class: 'symbols' }, [
  el('span', { class: 'label', text: 'Symbols' }),
  el('ul', {}, items.map(([tex, text]) => el('li', {}, [el('span', { class: 'sym', html: m`${tex}` }), el('span', { html: text })]))),
]);
const examples = (labels) => `${labels.slice(0, 3).map((l) => `“${l}”`).join(', ')}${labels.length > 3 ? ', …' : ''}`;

/* ---------- this page's row in the dock ---------- */

function readPage(state) {
  const dataset = DATASETS[state.dataset] ? state.dataset : 'berkeley';
  const { alpha, error } = readAlpha(state, 0.05);
  return { dataset, alpha, error };
}

const OWN = {
  id: 'procedure', label: 'this page',
  build(apply, later) {
    const data = el('select', { 'aria-label': 'dataset', onchange: (e) => apply({ dataset: e.target.value }) },
      Object.entries(DATASETS).map(([k, v]) => el('option', { value: k, text: v })));
    const alpha = el('input', { type: 'number', class: 'num', step: 'any', min: 0.001, max: 0.1, 'aria-label': 'significance level alpha' });
    onCommit(alpha, () => apply({ alpha: alpha.value }), later);
    return {
      nodes: [el('div', { class: 'row' }, [field('dataset', data), field('α', alpha)])],
      refresh(v) { if (document.activeElement !== data) data.value = v.dataset; show(alpha, v.alpha); },
    };
  },
  summary: (v) => `${DATASETS[v.dataset].split(' · ')[0]} · α = ${v.alpha}`,
  notes: [
    '<strong>dataset</strong>: Berkeley’s 1973 admissions pooled over six departments (the default), two generators read as pairs (one output × the next), the textbook example Y = X², or two columns of a CSV file of yours.',
    '<strong>α</strong>: the significance level, the false-alarm rate you accept (0.001–0.1).',
  ],
};

/* ---------- the CSV, held here only ---------- */

const csv = { name: null, parsed: null, error: null, jx: 0, jf: 1, binning: 'quantile', bins: 4 };

function fileCard(redraw) {
  const input = el('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv', 'aria-label': 'CSV file' });
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const parsed = parseCSV(await f.text());
      if (parsed.header.length < 2) throw new Error('the file needs at least two columns');
      Object.assign(csv, { name: f.name, parsed, error: null, jx: 0, jf: 1 });
    } catch (e) {
      Object.assign(csv, { name: f.name, parsed: null, error: e.message });
    }
    redraw();
  });
  const kids = [
    el('h2', { text: 'Your file' }),
    el('p', { class: 'small', html: 'A CSV with a header row (comma, semicolon or tab). Choose the two columns to cross; a numeric column is first cut into bins. <strong>The file is read on your device and never leaves it</strong>: not uploaded, not stored, not put in the address bar.' }),
    el('div', { class: 'row' }, [field(csv.name ? `loaded: ${csv.name}` : 'file', input)]),
  ];
  if (csv.error) kids.push(el('p', { class: 'err', text: `Could not read ${csv.name}: ${csv.error}.` }));
  const P = csv.parsed;
  if (P) {
    const cols = P.columns;
    const pick = (label, key) => el('select', { 'aria-label': label, onchange: (e) => { csv[key] = Number(e.target.value); redraw(); } },
      cols.map((c, j) => el('option', { value: j, text: `${c.name}${c.numeric ? ' (numeric)' : ''}`, selected: j === csv[key] })));
    const binning = el('select', { 'aria-label': 'binning of numeric columns', onchange: (e) => { csv.binning = e.target.value; redraw(); } },
      [['quantile', 'equal counts'], ['equalWidth', 'equal width']].map(([v, t]) => el('option', { value: v, text: t, selected: v === csv.binning })));
    const bins = el('select', { 'aria-label': 'number of bins', onchange: (e) => { csv.bins = Number(e.target.value); redraw(); } },
      [2, 3, 4, 5, 6, 8, 10].map((k) => el('option', { value: k, text: String(k), selected: k === csv.bins })));
    const numeric = cols[csv.jx]?.numeric || cols[csv.jf]?.numeric;
    kids.push(
      el('div', { class: 'row' }, [field('X (rows)', pick('column for X', 'jx')), field('F (columns)', pick('column for F', 'jf')),
        ...(numeric ? [el('span', { class: 'vrule' }), field('bins', binning), field('how many', bins)] : [])]),
      numeric ? el('p', { class: 'small muted', text: 'Choose the bins before looking at the result: trying bins until p drops below α makes the p-value meaningless.' }) : null,
      el('h3', { class: 'panel-title', text: `The first rows (of ${thin(P.rows.length)})` }),
      dataTable(P.header, P.rows.slice(0, 10).map((r) => P.header.map((_, j) => r[j] ?? ''))),
    );
  }
  return el('div', { class: 'card' }, kids);
}

/* ---------- the data of the page ---------- */

/** The records of the chosen dataset, or null when the CSV is not loaded yet. */
function dataOf(page, inputs) {
  if (page.dataset === 'berkeley') return berkeley(inputs.seed);
  if (page.dataset === 'good' || page.dataset === 'lcgLow') return generator(page.dataset, inputs.seed);
  if (page.dataset === 'square') return square(inputs.seed);
  const P = csv.parsed;
  if (!P || csv.jx === csv.jf) return null;
  const { pairs, skipped } = pairsFrom(P, csv.jx, csv.jf);
  if (pairs.length < 2) return null;
  const d = fromCSV(pairs, { xNumeric: P.columns[csv.jx].numeric, fNumeric: P.columns[csv.jf].numeric, binning: csv.binning, bins: csv.bins });
  return { ...d, skipped, xName: P.header[csv.jx], fName: P.header[csv.jf] };
}

/* ---------- the procedure in words ---------- */

/** The five steps as a flow of boxes, each with the current dataset's own number. */
function flow(alpha, x) {
  const t = x.table, rp = t.rowProfiles(), C = t.C, N = t.N, E = x.expected;
  let j = 0, spread = -1;
  for (let k = 0; k < t.c; k++) { const col = rp.map((r) => r[k]), sp = Math.max(...col) - Math.min(...col); if (sp > spread) { spread = sp; j = k; } }
  const col = rp.map((r) => r[j]), hi = col.indexOf(Math.max(...col)), lo = col.indexOf(Math.min(...col));
  const V = effectSizes(x).cramerV, reject = x.p <= alpha;
  const box = (n, title, big, small) => el('div', { class: 'fbox' }, [
    el('span', { class: 'fn', text: n }), el('div', { class: 'ft', text: title }), el('div', { class: 'fbig', html: big }), el('div', { class: 'fsmall', html: small }),
  ]);
  return el('div', { class: 'flow' }, [
    box('1', 'count', `${thin(N)} records`, `→ a ${t.r} × ${t.c} table`),
    box('2', 'compare the rows', `${pc1(rp[hi][j])} vs ${pc1(rp[lo][j])}`, `“${t.cols[j]}” among “${t.rows[hi]}” vs “${t.rows[lo]}”`),
    box('3', 'expected if independent', `${num(E[hi][j], 1)} vs ${thin(t.at(hi, j))}`, `expected vs observed, “${t.rows[hi]}” × “${t.cols[j]}”`),
    box('4', 'measure the gap', `χ² = ${x.chi2.toPrecision(4)}`, 'all cells’ gaps in one number'),
    box('5', 'decide', `p = ${pText(x)}`, `${reject ? '≤' : '>'} α = ${alpha} → <strong>${reject ? 'dependent' : 'no evidence'}</strong>; V = ${V.toFixed(2)} (${strengthWord(V)})`),
  ]);
}

/** How to read a χ² test, on one annotated curve: an illustration with df = 4 (a 3 × 3 table)
 *  and two possible observed values, one kept and one rejected. */
function anatomy(alpha) {
  const df = 4, crit = chi2Inv(1 - alpha, df), A = 3, B = 12;
  const pA = chi2Tail(A, df).p, pB = chi2Tail(B, df).p;
  const W = 660, H = 330, pad = { l: 20, r: 14, t: 74, b: 40 }, xmax = 17, ymax = 0.19;
  const X = (v) => pad.l + (v / xmax) * (W - pad.l - pad.r), Y = (d) => pad.t + (1 - d / ymax) * (H - pad.t - pad.b);
  const f = (v) => chi2Pdf(v, df);
  const NS = 'http://www.w3.org/2000/svg';
  const nd = (tag, attrs = {}, text = null) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text !== null) e.textContent = text; return e; };
  const area = (from, cls) => {
    let d = `M${X(from)} ${Y(0)}`;
    for (let k = 0; k <= 80; k++) { const v = from + ((xmax - from) * k) / 80; d += `L${X(v).toFixed(1)} ${Y(f(v)).toFixed(1)}`; }
    return nd('path', { d: `${d}L${X(xmax)} ${Y(0)}Z`, class: cls });
  };
  const text = (x, y, t, cls = 'ann', anchor = 'start') => svg.append(nd('text', { x, y, 'text-anchor': anchor, class: cls }, t));
  const svg = nd('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'anatomy', 'aria-label': `the chi-square curve with 4 degrees of freedom: the critical value ${crit.toFixed(2)} leaves an area alpha on its right; an observed value of 3 has p ${pA.toFixed(2)}, one of 12 has p ${pB.toFixed(3)}` });
  for (const t of [0, 4, 8, 12, 16]) {
    svg.append(nd('line', { x1: X(t), x2: X(t), y1: Y(0), y2: Y(0) + 4, class: 'axis' }));
    text(X(t), Y(0) + 16, String(t), 'tick', 'middle');
  }
  svg.append(nd('line', { x1: X(0), x2: X(xmax), y1: Y(0), y2: Y(0), class: 'axis' }));
  text((X(0) + X(xmax)) / 2, H - 6, 'values of χ² that chance alone produces when X and F are independent', 'axis-ttl', 'middle');
  svg.append(area(crit, 'alpha'));
  svg.append(area(B, 'parea'));
  let d = '';
  for (let k = 1; k <= 200; k++) { const v = (xmax * k) / 200; d += `${k === 1 ? 'M' : 'L'}${X(v).toFixed(1)} ${Y(f(v)).toFixed(1)}`; }
  svg.append(nd('path', { d, class: 'curve' }));
  text(X(0.2), Y(f(2)) - 8, `typical: ≈ df = ${df}`, 'ann');
  // the critical value, labelled in the band above the curve
  svg.append(nd('line', { x1: X(crit), x2: X(crit), y1: Y(0), y2: 18, class: 'crit' }));
  text(X(crit) + 4, 14, `critical value ${crit.toFixed(2)}`, 'ann alpha-t');
  // α: the orange area, pointed at
  svg.append(nd('line', { x1: X(crit + 1.6), y1: Y(0.062), x2: X(crit + 0.9), y2: Y(0.012), class: 'lead alpha-l' }));
  text(X(crit + 1.7), Y(0.07), `orange area = α = ${alpha}`, 'ann alpha-t');
  text(X(crit + 1.7), Y(0.07) + 13, 'the false alarms we accept', 'ann small-t');
  // two observed values, labelled above, with their line down to the axis
  const obs = (v, p, cls, y) => {
    svg.append(nd('line', { x1: X(v), x2: X(v), y1: Y(0), y2: y + 4, class: cls }));
    svg.append(nd('circle', { cx: X(v), cy: Y(0), r: 4, class: cls }));
    text(X(v) + 4, y, `observed χ² = ${v} → p = ${p < 0.01 ? p.toFixed(3) : p.toFixed(2)}`, `ann ${cls}-t`);
    text(X(v) + 4, y + 14, p > alpha ? 'p > α: no evidence of dependence' : 'p ≤ α: reject independence', 'ann small-t');
  };
  obs(A, pA, 'obsA', 40);
  obs(B, pB, 'obsB', 40);
  svg.append(nd('line', { x1: X(B + 2), y1: Y(0.045), x2: X(B + 0.9), y2: Y(0.006), class: 'lead obsB-l' }));
  text(X(B + 2.1), Y(0.05), 'teal area = p', 'ann obsB-t');
  const wrap = el('div', { class: 'chart' });
  wrap.append(svg);
  return wrap;
}

function overview(alpha, x) {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The method at a glance' }),
    el('p', { html: '<strong>Question</strong>: given N pairs (x, f), does knowing X change the chances of F?' }),
    el('div', { class: 'eq', html: M`\text{independent} \iff P(F = j \mid X = i) = P(F = j) \quad \text{for every } i, j` }),
    el('h3', { class: 'panel-title', text: 'How: five steps (numbers of the dataset in the dock)' }),
    x ? flow(alpha, x) : el('p', { class: 'muted small', text: 'Load a CSV to see the steps on your data.' }),
    el('h3', { class: 'panel-title', text: 'How to read the decision (illustration, a 3 × 3 table: df = 4)' }),
    el('div', {}, [
      anatomy(alpha),
      symbols([
        ['\\chi^2', 'the gap between the table and independence (step 4)'],
        ['\\text{df}', '(rows − 1)(columns − 1): which curve to use'],
        ['\\alpha', `the false-alarm rate you accept: ${alpha} = 1 in ${Math.round(1 / alpha)} (Fisher’s convention)`],
        ['\\text{critical}', 'the χ² beyond which the area is α'],
        ['p', 'the area beyond your χ²: how often chance alone goes that far'],
      ]),
    ]),
    el('p', { class: 'small muted', html: `Why chance has this shape: each cell’s gap divided by ${m`\sqrt E`} behaves like a standard normal number, and χ² adds up df of their squares (${link('theory.html', 'theory')}).` }),
    el('h3', { class: 'panel-title', text: 'Other thresholds on this page' }),
    dataTable(['threshold', 'meaning', 'why this value'], [
      ['expected count ≥ 5', 'the curve can be trusted (E2)', 'rule of thumb (Cochran): below 5 counts are too lumpy'],
      ['V = 0.1 / 0.3 / 0.5', 'weak / moderate / strong', 'Cohen’s conventions; in a cipher even 0.01 is serious'],
      ['power 80 %', 'chance to find a real association (E4)', 'convention: missing 1 time in 5 is accepted'],
      ['⚠ expected < 10', 'power numbers only rough (E4)', 'a count expected at 5 is below 5 half the time, at 10 only 3 %'],
    ], 'words prose wrap'),
  ]);
}

/* ---------- E1 · the table, step by step ---------- */

let e1View = 'counts';

function e1(x, d) {
  const t = x.table, O = t.matrix(), R = t.R, C = t.C, N = t.N, E = x.expected, rp = t.rowProfiles();
  const rMax = Math.max(2, ...x.residuals.flat().map(Math.abs));
  // the column whose share differs most between two rows: the example used in the text
  let best = { j: 0, spread: -1, hi: 0, lo: 0 };
  for (let j = 0; j < t.c; j++) {
    const col = rp.map((r) => r[j]), spread = Math.max(...col) - Math.min(...col);
    if (spread > best.spread) best = { j, spread, hi: col.indexOf(Math.max(...col)), lo: col.indexOf(Math.min(...col)) };
  }
  const { j, hi, lo } = best;
  const [ei, ej] = [hi, j];   // the worked cell
  const xr = t.rows[ei], fc = t.cols[ej];

  const VIEWS = {
    counts: {
      label: '1 · counts',
      formula: M`O_{ij} = \text{number of records with } X = i,\ F = j`,
      reading: `Totals in brackets: the <strong>marginal frequencies</strong> (${pc1(R[ei] / N)} are “${xr}”).`,
      keys: [['i', `a row: a category of X (${examples(t.rows)})`], ['j', `a column: a category of F (${examples(t.cols)})`], ['O_{ij}', 'the <strong>observed</strong> count: records in row i and column j'],
        ['R_i', 'the total of row i'], ['C_j', 'the total of column j'], ['N', `the number of all records, ${thin(N)}`]],
      tbl: () => cellTable({ table: t, cell: (i, jj) => thin(O[i][jj]), rowMargin: (i) => `${thin(R[i])} (${pc1(R[i] / N)})`, colMargin: (jj) => `${thin(C[jj])} (${pc1(C[jj] / N)})`, corner: thin(N) }),
    },
    rows: {
      label: '2 · row profiles',
      formula: M`\hat p(j \mid i) = \frac{O_{ij}}{R_i} \quad \text{the share of } F = j \text{ among the records with } X = i`,
      reading: `The <strong>conditional frequencies</strong>: independent ⇔ every row equals the bottom row (${pc1(C[j] / N)} “${t.cols[j]}”).`,
      keys: [['\\hat p(j \\mid i)', 'the share of column j within row i (read “given”: the share of F = j given X = i)'], ['O_{ij}', 'the observed count (view 1)'], ['R_i', 'the total of row i']],
      tbl: () => cellTable({ table: t, cell: (i, jj) => ({ text: pc1(rp[i][jj]), title: `${O[i][jj]} / ${R[i]}` }), rowMargin: () => '100 %', colMargin: (jj) => pc1(C[jj] / N), corner: '100 %', marginHeads: ['total', 'all'] }),
    },
    expected: {
      label: '3 · expected',
      formula: M`E_{ij} = R_i \cdot \frac{C_j}{N} \quad \text{the row total × the overall share of the column}`,
      reading: `For “${xr}” × “${fc}”: ${m`${R[ei]} \times ${C[ej]} / ${N} = ${num(E[ei][ej], 1)}`}, observed ${thin(O[ei][ej])}. Outlined: the df = ${x.df} free cell${x.df === 1 ? '' : 's'}.`,
      keys: [['E_{ij}', 'the <strong>expected</strong> count in row i, column j if X and F were independent'], ['R_i,\\ C_j,\\ N', 'the row total, the column total, all records (as in view 1)'],
        ['C_j / N', `the overall share of column j (for “${fc}”: ${pc1(C[ej] / N)})`], ['\\text{df}', `degrees of freedom: the cells still free once the totals are fixed, (r − 1)(c − 1) for r rows and c columns; here ${x.df}`]],
      tbl: () => cellTable({ table: t, cell: (i, jj) => ({ text: num(E[i][jj], 1), cls: t.isFree(i, jj) ? 'free' : null, title: `${R[i]} × ${C[jj]} / ${N}` }), rowMargin: (i) => thin(R[i]), colMargin: (jj) => thin(C[jj]), corner: thin(N) }),
    },
    residuals: {
      label: '4 · the gap, χ²',
      formula: M`r_{ij} = \frac{O_{ij} - E_{ij}}{\sqrt{E_{ij}}}, \qquad \chi^2 = \sum_{ij} r_{ij}^2`,
      reading: `For “${xr}” × “${fc}”: ${m`(${O[ei][ej]} - ${num(E[ei][ej], 1)}) / \sqrt{${num(E[ei][ej], 1)}} = ${num(x.residuals[ei][ej])}`}. Orange: more than expected, blue: fewer. Total: <strong>χ² = ${x.chi2.toPrecision(4)}</strong>.`,
      keys: [['O_{ij}', 'the <strong>observed</strong> count (view 1)'], ['E_{ij}', 'the <strong>expected</strong> count if X and F were independent (view 3)'],
        ['O_{ij} - E_{ij}', 'the gap: how many records more (+) or fewer (−) than independence predicts'], ['\\sqrt{E_{ij}}', 'the typical size of a chance gap in that cell'],
        ['r_{ij}', 'the gap measured in that unit (the cells of this table)'], ['\\chi^2', 'the sum of all the squared gaps: one number for the whole table']],
      tbl: () => cellTable({ table: t, cell: (i, jj) => ({ ...residualCell(x.residuals[i][jj], rMax), title: `O = ${O[i][jj]}, E = ${num(E[i][jj])}` }),
        rowMargin: (i) => num(x.residuals[i].reduce((s, r) => s + r * r, 0)), colMargin: (jj) => num(x.residuals.reduce((s, row) => s + row[jj] ** 2, 0)), corner: num(x.chi2), marginHeads: ['Σ r²', 'Σ r²'] }),
    },
  };

  const holder = el('div');
  const draw = (key) => {
    const v = VIEWS[key] ?? VIEWS.counts;
    holder.replaceChildren(
      el('div', { class: 'view-formula', html: v.formula }),
      symbols(v.keys),
      v.tbl(),
      el('p', { class: 'small view-reading', html: v.reading }),
      ...(key === 'residuals' ? [legend([['bar', 'var(--m2)', 'more than expected'], ['bar', 'var(--m1)', 'fewer than expected']])] : []),
    );
  };
  if (!VIEWS[e1View]) e1View = 'counts';
  draw(e1View);
  const dropped = [...x.droppedRows, ...x.droppedCols];

  return labPanel({
    hw: HW, id: 'E1', title: 'E1 · The table, step by step', name: `E1-${d.key}`,
    question: 'What do the counts say before any test, and what would they look like under independence?',
    view: () => ({
      answer: { text: `${thin(N)} records. Among “${t.rows[hi]}”, ${pc1(rp[hi][j])} are “${t.cols[j]}”; among “${t.rows[lo]}”, ${pc1(rp[lo][j])}; overall ${pc1(C[j] / N)}. Independence would put ${num(E[ei][ej], 1)} records in the cell “${xr}” × “${fc}”; there are ${thin(O[ei][ej])}.` },
      body: [
        dropped.length ? el('p', { class: 'small err', html: `${dropped.map((l) => `“${l}”`).join(', ')} never occur${dropped.length === 1 ? 's' : ''} and ${dropped.length === 1 ? 'is' : 'are'} left out (an empty row or column says nothing about dependence).` }) : null,
        el('div', { class: 'cols wide-first' }, [
          el('div', {}, [viewSwitch(Object.entries(VIEWS).map(([k, v]) => [k, v.label]), e1View, (k) => { e1View = k; draw(k); }, 'step of the procedure'), holder]),
          el('div', {}, [
            mosaic({ table: t, marginLine: true, label: `mosaic plot of the table: ${t.rows.map((r, i) => `${r} ${rp[i].map((q, jj) => `${pc1(q)} ${t.cols[jj]}`).join(', ')}`).join('; ')}` }),
            legend([...t.cols.map((c, jj) => ['bar', categoryColors(t.c)[jj], c]), ['dash', 'var(--c-third)', 'overall shares']]),
            el('p', { class: 'small muted', text: 'Step 2 as a picture: one column per row of the table, as wide as its total; the heights are its shares. Under independence every split would sit on the dashed lines.' }),
          ]),
        ]),
      ],
      rows: t.rows.flatMap((r, i) => t.cols.map((c, jj) => ({ x: r, f: c, observed: O[i][jj], expected: E[i][jj], rowProfile: rp[i][jj], residual: x.residuals[i][jj] }))),
      summary: { dataset: d.key, N, rows: t.rows, cols: t.cols, observed: O },
    }),
    notes: ['The four buttons are steps 1–4 of the procedure, in order; the table underneath is always the same, read in a different way. Hover a cell for the fraction behind it.'],
  });
}

/* ---------- E2 · the test and the decision ---------- */

function nullDensity(x, alpha) {
  const df = x.df, crit = chi2Inv(1 - alpha, df), bulk = chi2Inv(0.9999, df);
  const off = x.chi2 > 3 * bulk;
  const xmax = off ? Math.max(bulk, crit * 1.25) : Math.max(bulk, x.chi2 * 1.08, crit * 1.25);
  const lo = df <= 2 ? xmax / 400 : 0;
  const f = (v) => chi2Pdf(v, df);
  const layers = [
    { type: 'line', points: curve(f, lo, xmax, 300), color: INK, label: `χ² curve, ${df} df` },
    { type: 'vline', at: crit, dash: true, color: MUTED, text: `α = ${alpha}` },
  ];
  if (!off) {
    layers.unshift({ type: 'band', band: curve(f, Math.max(lo, x.chi2), xmax, 120).map(([a, b]) => [a, 0, b]), color: 'var(--s1)', label: 'p = the area beyond χ²' });
    layers.push({ type: 'vline', at: x.chi2, color: 'var(--s1)' });
  }
  return el('div', {}, [
    plot({ x: { min: 0, max: xmax, title: 'value of χ²' }, y: { min: 0, max: df === 1 ? 0.8 : undefined, title: 'density' }, width: 460, height: 240, layers,
      label: `the chi-square curve with ${df} degrees of freedom, the critical value ${crit.toFixed(2)} and the observed chi-square ${x.chi2.toPrecision(4)}` }),
    legend([
      ['line', INK, 'how χ² would vary if X and F were independent'],
      ...(off ? [] : [['band', 'var(--s1)', `p = ${pText(x)}: the area beyond the observed χ² (solid line)`]]),
      ['dash', MUTED, `α line: the area beyond it is α = ${alpha}`],
    ]),
    off ? tailZoom(x) : null,
  ]);
}

/** The same curve beyond the observed χ², magnified until the area p can be seen. The density
 *  is computed in logs (at χ² = 4000 it is about 10⁻⁸⁷²) and divided by a power of ten. */
function tailZoom(x) {
  const df = x.df, k = df / 2;
  const lnF = (v) => (k - 1) * Math.log(v) - v / 2 - k * Math.LN2 - lnGamma(k);
  const x0 = x.chi2, w = 14;
  const e = Math.floor(lnF(x0) / Math.LN10);
  const g = (v) => Math.exp(lnF(v) - e * Math.LN10);   // the density in units of 10^e
  const pts = curve(g, x0, x0 + w, 120);
  return el('div', { class: 'zoom' }, [
    el('p', { class: 'small', html: `<strong>Zoom on the tail beyond the observed χ²</strong>, heights magnified ${m`10^{${-e}}`} times: the teal area is p.` }),
    plot({
      x: { min: x0 - 2, max: x0 + w, title: 'value of χ²', format: (v) => String(Math.round(v)) }, y: { min: 0, title: `density (× 10${sup(e)})` }, width: 460, height: 170,
      layers: [
        { type: 'band', band: pts.map(([a, b]) => [a, 0, b]), color: 'var(--s1)', label: 'p' },
        { type: 'line', points: pts, color: INK },
        { type: 'vline', at: x0, color: 'var(--s1)', text: `observed χ² = ${x0.toPrecision(4)} · teal area = p = ${pText(x)}` },
      ],
      label: `the tail of the chi-square density beyond the observed value ${x0.toPrecision(4)}, magnified: its area is the p-value ${pText(x)}`,
    }),
  ]);
}

function decide(x, d, alpha) {
  const V = effectSizes(x).cramerV, tri = resultTriple(x, { cramerV: V }, { mutualInfoBits: 0, biasBits: 0 }, alpha);
  const crit = chi2Inv(1 - alpha, x.df), off = x.chi2 > 3 * chi2Inv(0.9999, x.df);
  const reject = x.p <= alpha;
  const v = x.validity;
  return labPanel({
    hw: HW, id: 'E2', title: 'E2 · The decision: is the gap more than chance?', name: `E2-${d.key}`,
    question: `χ² = ${x.chi2.toPrecision(4)}. If X and F were independent, how often would chance alone produce a gap this large?`,
    steps: [
      `the curve: how χ² varies by chance with df = ${x.df}; dashed: the critical value ${crit.toFixed(2)} (area beyond = α = ${alpha});`,
      'teal: the area beyond the observed χ², the <strong>p-value</strong>; p ≤ α → reject independence (as in the method card);',
      'then the strength, <strong>Cramér’s V</strong>: 0 = independent, 1 = one variable fixes the other.',
    ],
    view: () => ({
      answer: { text: `<strong>Evidence.</strong> p = ${pText(x)} ${reject ? '≤' : '>'} α = ${alpha}: ${reject ? 'reject' : 'do not reject'} independence.<br><strong>Strength.</strong> V = ${V.toFixed(2)}, ${strengthWord(V)}.<br><strong>Meaning.</strong> ${tri.meaning}` },
      body: [
        symbols([['\\chi^2', `the gap of the whole table (E1, view 4): here ${x.chi2.toPrecision(4)}`], ['\\text{df}', `degrees of freedom (E1, view 3): here ${x.df}`],
          ['p', 'the <strong>p-value</strong>: if X and F were independent, the probability of a χ² at least as large as the observed one'],
          ['\\alpha', `the false-alarm rate you accept, chosen in advance: here ${alpha}`], ['V', 'Cramér’s V, the strength: 0 = independent, 1 = one variable fixes the other']]),
        el('div', { class: 'cols wide-first' }, [
          el('div', {}, [...section(1, 'p is an area', off
            ? `The curve of χ² under independence; p is the area under it beyond the observed χ². Here χ² = ${x.chi2.toPrecision(4)} lies far beyond the right edge and that area is far too thin to see here: the zoom below makes it visible.`
            : 'The curve of χ² under independence; the teal area beyond the observed value is p.'), nullDensity(x, alpha)]),
          el('div', {}, [...section(2, 'Can the curve be trusted?'), validityBadge(v),
            el('p', { class: 'small', html: v.level === 'ok'
              ? `Every expected count is at least 5 (the smallest is ${num(v.minE, 1)}), so the smooth χ² curve is a good approximation of the real law of the statistic (why 5: see the method card).`
              : `${v.below5} of ${v.cells} expected counts are below 5 (the smallest is ${num(v.minE, 1)}). The χ² curve is only an approximation, poor with small counts: merge categories or collect more data.` }),
            d.correlation !== undefined ? el('p', { class: 'small', html: `<strong>The same data as numbers</strong>: the correlation of X and Y is r = ${d.correlation.toFixed(3)}, nothing at all, while the table finds V = 1: Y is a function of X. Correlation sees only straight lines (${link('theory.html', 'theory')}, trap 1).` }) : null,
          ]),
        ]),
      ],
      summary: { dataset: d.key, alpha, chi2: x.chi2, df: x.df, p: x.p, log10p: x.log10p, V, validity: v.level },
    }),
    why: 'the p-value only answers “could this be chance?”. With enough records even a tiny association gets a tiny p, so the strength V is reported next to it; and neither says anything about cause.',
    notes: [`The p-value is an integral of the χ² density (HW6’s tail integrals again); when it is smaller than about ${m`10^{-308}`} it is computed in logarithms, so it still prints.`],
  });
}

/* ---------- E3 · adding records (animated) ---------- */

const anim = { timer: null, chunk: 50 };
const stopAnim = () => { if (anim.timer) clearInterval(anim.timer); anim.timer = null; };

function stream(x, d, alpha) {
  stopAnim();
  const N = d.N, grid = Math.max(5, Math.ceil(N / 500));
  const path = [];   // [n, χ², V, p], every `grid` records
  {
    const t = new ContingencyTable(d.rows, d.cols);
    let n = 0;
    while (n < N) {
      const to = Math.min(N, n + grid);
      extend(t, d, n, to);
      n = to;
      const y = chiSquare(t);
      if (y.df > 0) path.push([n, y.chi2, effectSizes(y).cramerV, y.p]);
    }
  }
  const reject = x.p <= alpha, crit = chi2Inv(1 - alpha, x.df), Vfinal = effectSizes(x).cramerV;
  let lastAbove = 0;
  for (const q of path) if (q[3] > alpha) lastAbove = q[0];
  const stays = reject ? Math.min(N, lastAbove + grid) : null;
  const chiMax = Math.max(crit, ...path.map((q) => q[1])) * 1.1;
  const vMax = Math.min(1, Math.max(...path.slice(Math.floor(path.length / 20)).map((q) => q[2]), Vfinal) * 1.3);

  let cur = N, table = tableOf(d);
  const status = el('p', { class: 'small stream-status' });
  const left = el('div'), right = el('div'), counts = el('div', { class: 'stream-table' });
  const play = el('button', { type: 'button', class: 'primary' });
  const draw = () => {
    const y = chiSquare(table), shown = path.filter((q) => q[0] <= cur), last = shown.at(-1);
    status.innerHTML = cur === 0 ? 'No records yet.' : `N = <strong>${thin(cur)}</strong> of ${thin(N)} records · χ² = <strong>${y.chi2.toPrecision(4)}</strong> · V = <strong>${effectSizes(y).cramerV.toFixed(3)}</strong>`;
    left.replaceChildren(...section(1, 'χ²: the evidence').filter(Boolean), plot({
      x: { min: 0, max: N, title: 'records so far' }, y: { min: 0, max: chiMax, title: 'χ²' }, width: 420, height: 220,
      layers: [
        { type: 'hline', at: crit, dash: true, color: MUTED, text: `above: reject (α = ${alpha})` },
        { type: 'line', points: shown.map((q) => [q[0], q[1]]), color: 'var(--s1)' },
        ...(last ? [{ type: 'points', points: [[last[0], last[1]]], color: 'var(--s1)' }] : []),
      ],
      label: `chi-square against the number of records, up to ${cur}`,
    }));
    right.replaceChildren(...section(2, 'V: the strength').filter(Boolean), plot({
      x: { min: 0, max: N, title: 'records so far' }, y: { min: 0, max: vMax, title: 'V' }, width: 420, height: 220,
      layers: [
        { type: 'hline', at: Vfinal, dash: true, color: MUTED, text: `all records: V = ${Vfinal.toFixed(2)}` },
        { type: 'line', points: shown.map((q) => [q[0], q[2]]), color: 'var(--s2)' },
        ...(last ? [{ type: 'points', points: [[last[0], last[2]]], color: 'var(--s2)' }] : []),
      ],
      label: `Cramér's V against the number of records, up to ${cur}`,
    }));
    counts.replaceChildren(el('div', { class: 'label', text: 'The table so far' }), cellTable({ table, cell: (i, j) => thin(table.at(i, j)), label: `the counts after ${cur} records` }));
    play.textContent = anim.timer ? '❚❚ Pause' : cur >= N ? '▶ Play from the start' : '▶ Play';
  };
  const tick = () => {
    const to = Math.min(N, cur + anim.chunk);
    extend(table, d, cur, to);
    cur = to;
    if (cur >= N) stopAnim();
    draw();
  };
  const restart = () => { if (cur >= N) { cur = 0; table = new ContingencyTable(d.rows, d.cols); } };
  play.addEventListener('click', () => {
    if (anim.timer) { stopAnim(); draw(); return; }
    restart();
    anim.timer = setInterval(tick, 110);
    tick();
  });
  const step = el('button', { type: 'button', text: 'Step', onclick: () => { stopAnim(); restart(); tick(); } });
  const chunk = el('select', { 'aria-label': 'records per step', onchange: (e) => { anim.chunk = Number(e.target.value); } },
    [10, 50, 250].map((k) => el('option', { value: k, text: `${k} records per step`, selected: k === anim.chunk })));
  draw();

  return labPanel({
    hw: HW, id: 'E3', title: 'E3 · Adding records: the evidence grows, the strength does not', name: `E3-${d.key}`,
    question: 'What happens to χ² and to V as more and more records arrive?',
    steps: [
      `press ▶ Play: the records are added a chunk at a time (${d.order});`,
      `plot 1: χ² so far. The dashed line is the critical value: above it p ≤ α and the test rejects independence;`,
      'plot 2: V so far. The dashed line is V on all the records.',
    ],
    controls: [play, step, chunk],
    view: () => ({
      answer: { text: reject
        ? `χ² keeps growing and stays above the line from <strong>N ≈ ${thin(stays)}</strong>; V settles at <strong>${Vfinal.toFixed(2)}</strong>. More records give more evidence, not a stronger association.`
        : `χ² never stays above the line, and V sinks towards 0: no association shows up, however many records arrive.` },
      body: [status, el('div', { class: 'cols' }, [left, right]), counts],
      rows: path.map(([n, c, V, p]) => ({ N: n, chi2: c, V, p })),
      summary: { dataset: d.key, alpha, N, finalChi2: x.chi2, V: Vfinal, staysAboveFrom: stays },
    }),
    why: 'a tiny p can come from a weak association seen on many records. Always read V next to p.',
  });
}

/* ---------- E4 · what the test could have seen ---------- */

/** One row per possible true strength V: a bar as long as the chance that the test finds it,
 *  with the percentage and a verdict written next to it (never colour alone). */
function powerBars(list, N) {
  const pctOf = (q) => Math.round(100 * q);
  const verdict = (pc) => (pc >= 99 ? 'always found' : pc >= 80 ? 'usually found' : pc >= 50 ? 'often missed' : 'usually missed');
  return el('div', { class: 'power-bars', role: 'table', 'aria-label': `how often a test on ${N} records finds an association of strength V` }, [
    el('div', { class: 'pb-row pb-head', role: 'row' }, [
      el('span', { role: 'columnheader', text: 'if the true V were' }),
      el('span', { role: 'columnheader', text: 'how often the test finds it' }),
      el('span', { role: 'columnheader', text: '' }),
    ]),
    ...list.map(({ v, q, measured }) => el('div', { class: `pb-row${measured ? ' measured' : ''}`, role: 'row' }, [
      el('span', { class: 'pb-v', role: 'cell', text: `${measured ? 'measured ' : ''}V = ${v < 0.01 ? v.toPrecision(2) : v.toFixed(3)}` }),
      el('span', { class: 'pb-track', role: 'cell' }, [
        el('span', { class: `pb-fill ${pctOf(q) >= 80 ? 'found' : 'missed'}`, style: `width:${(100 * q).toFixed(1)}%` }),
        el('span', { class: 'pb-80', title: '80 %' }),
      ]),
      el('span', { class: 'pb-pct', role: 'cell', text: `${pctOf(q)} % · ${verdict(pctOf(q))}` }),
    ])),
  ]);
}

function e4(x, d, alpha) {
  const df = x.df, N = x.N, k = Math.sqrt(Math.min(x.r, x.c) - 1);
  const V = effectSizes(x).cramerV, V80 = detectableW({ df, N, alpha }) / k;
  const powerAt = (v) => power({ df, N, w: v * k, alpha });
  const nice2 = (v) => Number(v.toPrecision(2));
  const list = [0.25, 0.5, 0.75, 1, 1.5, 2.5].map((f) => (f === 1 ? V80 : nice2(f * V80))).filter((v) => v <= 1).map((v) => ({ v, q: powerAt(v) }));
  list.push({ v: V, q: powerAt(V), measured: true });
  list.sort((a, b) => a.v - b.v);
  // with n records the smallest expected count is n × (smallest row share) × (smallest column share): below 10 the formula is only a rough guide
  // (10, not 5: the count of a random table fluctuates around it; at 5, most simulated tables fell below 5)
  const minShare = (Math.min(...x.table.R) / N) * (Math.min(...x.table.C) / N);
  const rows = [[0.1, 'weak'], [0.3, 'moderate'], [0.5, 'strong']].map(([v, word]) => {
    const n = sampleSize({ df, w: v * k, alpha }).n;
    return [`${v} (${word})`, n * minShare < 10 ? `${thin(n)} ⚠` : thin(n)];
  });
  const rough = rows.some((r) => r[1].endsWith('⚠'));
  return labPanel({
    hw: HW, id: 'E4', title: 'E4 · Could the test have missed it?', name: `E4-${d.key}`,
    question: `With ${thin(N)} records, how strong must an association be for the test to find it?`,
    steps: [
      'each row is a possible true strength V of the association, from weak (top) to strong (bottom);',
      `the bar shows how often a test on ${thin(N)} records would find it; the thin mark is 80 %, the usual target: an association of that strength would be missed at most 1 time in 5;`,
      'teal: found at least 80 % of the time; orange: often missed. The bold row is the V measured on these data.',
    ],
    view: () => ({
      answer: { text: V >= V80
        ? `With ${thin(N)} records the test finds any association with <strong>V ≥ ${V80.toFixed(3)}</strong> at least 80 % of the time. The measured V = ${V.toFixed(3)} is above that: the test could not easily have missed it.`
        : `With ${thin(N)} records the test finds an association at least 80 % of the time only if <strong>V ≥ ${V80.toFixed(3)}</strong>. The measured V = ${V.toFixed(3)} is below: a weak association could be there and go unnoticed, so “not significant” does not mean “independent”.` },
      body: [el('div', { class: 'cols wide-first' }, [
        el('div', {}, [powerBars(list, N)]),
        el('div', {}, [el('h3', { class: 'panel-title', text: 'Records needed to find V 80 % of the time' }), dataTable(['true V', 'records'], rows),
          el('p', { class: 'small muted', text: `For this table’s shape (df = ${df}) and α = ${alpha}. Half the strength needs four times the records.${rough ? ' ⚠ too few records per cell (smallest expected count below 10): only a rough guide.' : ''}` })]),
      ])],
      rows: list.map(({ v, q, measured }) => ({ V: v, power: q, measured: !!measured })),
      summary: { dataset: d.key, alpha, df, N, V80, V },
    }),
    why: 'a test that could not have seen an association proves nothing by not seeing it.',
  });
}

/* ---------- the page ---------- */

startPage({
  shell: hw07Shell('procedure.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    stopAnim();
    const inputs = readInputs(api.state), page = readPage(api.state);
    const error = inputs.error ?? page.error;
    dock({ ...inputs, error }, api.update, OWN, page);
    if (error) return [rejected(error)];
    const redraw = () => api.draw();
    const head = [
      abstract({
        question: 'How does one go, step by step, from a list of pairs (x, f) to the decision “independent or not” — and what does each number on the way mean?',
        findings: [
          '<strong>Five steps</strong>: count the table, compare the rows, build the expected table (row total × column share), measure the gap (χ²), decide (p-value and V).',
          '<strong>Berkeley pooled</strong>: men 44.5 % admitted, women 30.4 %; independence would give 1043.5 admitted men, there are 1198. χ² = 92.2, p = 7.8 × 10⁻²²: strong evidence of a weak association (V = 0.14).',
          '<strong>Evidence grows, strength does not.</strong> As records arrive, V settles while χ² keeps growing with N; for a good generator χ² stays near its df.',
          '<strong>Not significant is not independent.</strong> With 4 526 records the test catches V ≥ 0.04 80 % of the time; a weaker association could be missed.',
        ],
        sections: [['overview', 'The method'], ['E1', 'E1 · the table'], ['E2', 'E2 · the decision'], ['E3', 'E3 · adding records'], ['E4', 'E4 · could it miss?']],
      }),
    ];
    const d0 = dataOf(page, inputs);
    const x0 = d0 ? chiSquare(tableOf(d0)) : null;
    head.push(anchor('overview', overview(page.alpha, x0 && x0.df > 0 ? x0 : null)));
    if (page.dataset === 'csv') head.push(fileCard(redraw));
    if (!d0) return [...head, el('div', { class: 'card' }, [el('p', { class: 'muted', text: csv.parsed ? 'Choose two different columns with at least two complete rows.' : 'Load a CSV file above to run the procedure on it.' })])];
    const d = { ...d0, key: page.dataset };
    const x = x0;
    if (x.df === 0) return [...head, el('div', { class: 'card' }, [el('p', { class: 'err', text: 'After leaving out empty rows and columns the table has a single row or column: there is nothing to test. Choose other columns.' })])];
    if (d.key === 'csv') {
      const notes = [];
      if (d.skipped) notes.push(`${thin(d.skipped)} rows with a missing value skipped`);
      if (d.mergedX) notes.push(`${d.mergedX} rare categories of ${d.xName} merged into “other”`);
      if (d.mergedF) notes.push(`${d.mergedF} rare categories of ${d.fName} merged into “other”`);
      if (notes.length) head.push(el('p', { class: 'small muted', text: `Your file: ${notes.join('; ')} (at most ${MAX_LEVELS} categories per column).` }));
    }
    return [...head, anchor('E1', e1(x, d)), anchor('E2', decide(x, d, page.alpha)), anchor('E3', stream(x, d, page.alpha)), anchor('E4', e4(x, d, page.alpha))];
  },
});
