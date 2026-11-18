/* home-page.js — the hw07 home page: the abstract, the honesty note, the exercise
   and the three datasets, the whole homework in one picture (Berkeley's pooled table
   drawn twice on the same margins: as independence would have it, and as observed),
   and the pages in reading order. No dock: nothing here is random. */

import { el, explain, pageLink, pageList } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { m } from '../../../assets/js/ui/math.js';
import { table as dataTable } from '../../../assets/js/ui/lab.js';
import { ContingencyTable } from '../core/table.js';
import { chiSquare, effectSizes } from '../core/tests.js';
import { pText } from '../core/interpret.js';
import { DEPARTMENTS, GENDERS, OUTCOMES } from '../../data/berkeley.js';
import { mosaic, marginProfiles, categoryColors, legend, abstract, anchor } from './widgets.js';
import { hw07Shell, PAGES, STICKY, MEMORY, NOTICE } from './shell.js';

const link = (href, text) => pageLink(PAGES, href, text);

/* Berkeley 1973, the six departments pooled: gender × admission */
const POOLED = ContingencyTable.fromCounts(GENDERS, OUTCOMES, [
  [DEPARTMENTS.reduce((s, d) => s + d.counts[0], 0), DEPARTMENTS.reduce((s, d) => s + d.counts[1], 0)],
  [DEPARTMENTS.reduce((s, d) => s + d.counts[2], 0), DEPARTMENTS.reduce((s, d) => s + d.counts[3], 0)],
]);

function exercise() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The exercise' }),
    el('p', { html: `Given a bivariate dataset ${m`(X, F)`}, that is ${m`N`} observations of two categorical variables:` }),
    el('ol', { class: 'steps' }, [
      el('li', { html: 'build the contingency table programmatically;' }),
      el('li', { html: 'compute the marginal and the conditional frequencies;' }),
      el('li', { html: `compute the expected frequencies under independence and the ${m`\chi^2`} statistic (and, optionally, its p-value);` }),
      el('li', { html: 'recall what independence means in probability and in statistics;' }),
      el('li', { html: 'decide whether the variables are independent or dependent;' }),
      el('li', { html: 'discuss the difference between statistical association and causality.' }),
    ]),
    el('h3', { class: 'panel-title', text: 'Three datasets, one message each' }),
    dataTable(['', 'X × F', 'the message'], [
      [el('span', { html: link('generators.html', 'D1 · random generators') }), 'one output × the next', 'independence is what “random” means; a generator can pass the test and still be predictable'],
      [el('span', { html: link('berkeley.html', 'D2 · Berkeley 1973') }), 'gender × admission', 'a strong association that vanishes inside every department: Simpson’s paradox'],
      [el('span', { html: link('procedure.html', 'D3 · any CSV') }), 'two columns you choose', 'the procedure works on any data; your file never leaves your device'],
    ], 'words prose wrap'),
    el('p', { class: 'small muted', html: `Extensions, one page each: ${link('side-channels.html', 'side channels')} (leakage is dependence on a secret), ${link('information.html', 'mutual information')} (dependence in bits), ${link('causality.html', 'causality')} (association without a cause).` }),
  ]);
}

/** The overview figure: one table, drawn as independence would have it and as observed. */
function overview() {
  const t = POOLED, x = chiSquare(t), V = effectSizes(x).cramerV;
  const [men, women] = t.rowProfiles().map((r) => r[0]);
  const admitted = t.C[0] / t.N;
  const colors = categoryColors(2);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The whole homework in one picture' }),
    el('p', { class: 'small', html: `Berkeley 1973, six departments pooled: ${t.N.toLocaleString('en-US').replace(',', ' ')} applications, gender × admission. Each column is as wide as its share of the applicants; inside it, the admitted are stacked under the rejected.` }),
    el('div', { class: 'cols' }, [
      el('div', {}, [
        el('h3', { class: 'panel-title', text: 'If gender and admission were independent' }),
        mosaic({ table: t, profiles: marginProfiles(t), label: `mosaic of the expected table under independence: both genders admitted at ${(100 * admitted).toFixed(1)} percent` }),
        el('p', { class: 'small muted', html: `The expected table ${m`E_{ij} = R_i C_j / N`}: same margins, and both columns split at the overall admission rate, ${(100 * admitted).toFixed(1)} %. The splits line up.` }),
      ]),
      el('div', {}, [
        el('h3', { class: 'panel-title', text: 'What was observed' }),
        mosaic({ table: t, marginLine: true, label: `mosaic of the observed table: men admitted at ${(100 * men).toFixed(1)} percent, women at ${(100 * women).toFixed(1)} percent` }),
        el('p', { class: 'small muted', html: `Men ${(100 * men).toFixed(1)} %, women ${(100 * women).toFixed(1)} % admitted; the dashed line is where independence would split them. The splits do not line up.` }),
      ]),
    ]),
    legend([['bar', colors[0], 'admitted'], ['bar', colors[1], 'rejected'], ['dash', 'var(--c-third)', 'split under independence']]),
    el('p', { html: `The distance between the two pictures is ${m`\chi^2 = \sum (O_{ij} - E_{ij})^2 / E_{ij} = ${x.chi2.toFixed(1)}`} on 1 degree of freedom: ${m`p = `}${pText(x)}, so the gap is far too large to be chance; its size is Cramér's ${m`V = ${V.toFixed(2)}`}, a weak association. Yet inside every one of the six departments the gap disappears or reverses (${link('berkeley.html', 'Berkeley 1973')}): a significant association is not yet an explanation, and not a cause.` }),
    explain([
      'A mosaic plot is the picture of a contingency table: widths are the row margins, heights the row profiles (the conditional frequencies). Independence means every row has the same profile, which is the same as saying that every observed count equals its expected count: the splits line up exactly. The test asks whether the misalignment is larger than chance would produce.',
      'The two pictures have the same margins on purpose. The expected table is not any independent table: it is the independent table closest to the data (the maximum-likelihood fit), so the only thing that differs between the two pictures is the dependence itself.',
    ]),
  ]);
}

startPage({
  shell: hw07Shell('index.html'),
  sticky: STICKY,
  memory: MEMORY,
  render: () => [
    abstract({
      question: 'Every earlier homework assumed independence: of samples, of noise, of keys. This one tests it. For two categorical variables, are the data compatible with independence, how strong is the association if not, and what — if anything — does it say about cause?',
      findings: [
        `<strong>The procedure</strong>: count the table, compare it with the independent table that has the same totals (${m`E = R \cdot C / N`}), measure the gap with χ², then report the evidence (p), the strength (V, bits) and what the result does not mean.`,
        '<strong>Random generators</strong>: the last 4 bits of a textbook linear congruential generator (LCG) fill 8 of 256 cells (χ² = 70 000); its first 4 bits pass and are still predictable — like the Coldcard wallets.',
        '<strong>Berkeley 1973</strong>: men 44.5 %, women 30.4 % admitted (p ≈ 8 × 10⁻²²), yet no gap inside the departments (p = 0.22): Simpson’s paradox.',
        '<strong>Leaks and causes</strong>: a masked chip leaks through its variance, invisible to the classic t-test and plain to χ²; association is not cause, and a 99 % accurate alarm for a 1-in-100 000 target is right once in a thousand.',
      ],
      scope: 'homework',
      sections: [['exercise', 'The exercise'], ['overview', 'The whole homework in one picture'], ['pages', 'The pages']],
    }),
    el('p', { class: 'notice', text: NOTICE }),
    anchor('exercise', exercise()), anchor('overview', overview()), anchor('pages', pageList(PAGES)),
  ],
});
