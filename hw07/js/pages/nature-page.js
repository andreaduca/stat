/* nature-page.js — independence and its failures outside mathematics: nine short items
   from note 05, each labelled rigorous (the same mathematics), historical, or analogy,
   with its source (checked 18 Nov 2026). Four of them carry a plot of the original data,
   where a picture says more than the sentence: Mendel's peas against Bateson's sweet peas
   (independence vs linkage, two mosaics), Fisher's "too good" (both tails of χ²), Snow's
   cholera deaths by water company, and Matthews' storks coloured by country size. */

import { el, pageLink } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { plot, curve } from '../../../assets/js/ui/plot.js';
import { barChart } from '../../../assets/js/ui/barchart.js';
import { m } from '../../../assets/js/ui/math.js';
import { chi2Pdf, chi2Cdf, chi2Inv } from '../../../assets/js/core/numeric.js';
import { correlation } from '../../../assets/js/core/stats.js';
import { ContingencyTable } from '../core/table.js';
import { chiSquare, effectSizes } from '../core/tests.js';
import { pText } from '../core/interpret.js';
import { nice } from '../../../assets/js/ui/format.js';
import { mosaic, legend, categoryColors, evidenceHtml, abstract, anchor, INK, MUTED } from './widgets.js';
import { hw07Shell, PAGES, STICKY, MEMORY } from './shell.js';

const link = (href, text) => pageLink(PAGES, href, text);
const S = evidenceHtml('S');
const KIND = { rigorous: 'the same mathematics', historical: 'history', analogy: 'an analogy' };
const chip = (k) => `<span class="kind ${k}" title="${KIND[k]}">${k}</span>`;

/** One item: a title, its labels, two or three sentences, an optional figure, and its source. */
const item = (title, kinds, html, source, figure = null) => el('div', { class: 'nature-item' }, [
  el('h3', { html: `${title} ${kinds.map(chip).join(' ')}` }),
  el('p', { html }),
  figure,
  el('p', { class: 'small muted', html: `${S} ${source}` }),
]);
const card = (title, items) => el('div', { class: 'card' }, [el('h2', { text: title }), ...items]);
const why = (html) => el('p', { class: 'small fig-why', html });

/* ---------- the data ---------- */

/* Mendel (1866): F2 seeds, shape × colour */
const MENDEL = ContingencyTable.fromCounts(['round', 'wrinkled'], ['yellow', 'green'], [[315, 108], [101, 32]]);
/* Bateson, Saunders & Punnett (1905): F2 sweet peas, flower colour × pollen shape */
const SWEET = ContingencyTable.fromCounts(['purple', 'red'], ['long pollen', 'round pollen'], [[4831, 390], [393, 1338]]);
/* Fisher (1936): Mendel's experiments pooled, as in Fisher's table (Pires & Branco 2010, Table 5) */
const FISHER = { chi2: 41.6056, df: 84 };
/* Snow (1855), Table IX: houses supplied, cholera deaths, deaths per 10 000 houses */
const SNOW = [['Southwark & Vauxhall', 40046, 1263, 315], ['Lambeth', 26107, 98, 37], ['rest of London', 256423, 1422, 59]];
/* Matthews (2000), Table 1: country, area (km²), stork pairs, births (thousands per year) */
const STORKS = [['Albania', 28750, 100, 83], ['Austria', 83860, 300, 87], ['Belgium', 30520, 1, 118], ['Bulgaria', 111000, 5000, 117], ['Denmark', 43100, 9, 59],
  ['France', 544000, 140, 774], ['Germany', 357000, 3300, 901], ['Greece', 132000, 2500, 106], ['Holland', 41900, 4, 188], ['Hungary', 93000, 5000, 124],
  ['Italy', 301280, 5, 551], ['Poland', 312680, 30000, 610], ['Portugal', 92390, 1500, 120], ['Romania', 237500, 5000, 367], ['Spain', 504750, 8000, 439],
  ['Switzerland', 41290, 150, 82], ['Turkey', 779450, 25000, 1576]];

/* ---------- the figures ---------- */

function peasFigure() {
  const block = (t, title) => {
    const x = chiSquare(t), V = effectSizes(x).cramerV;
    return el('div', {}, [
      el('h4', { class: 'fig-title', text: title }),
      mosaic({ table: t, marginLine: true, width: 300, height: 210, label: `${title}: mosaic plot` }),
      legend(t.cols.map((c, j) => ['bar', categoryColors(2)[j], c]).concat([['dash', 'var(--c-third)', 'split if independent']])),
      el('p', { class: 'small', html: `χ² = ${x.chi2 >= 1000 ? nice(Math.round(x.chi2)) : x.chi2.toPrecision(3)}, p = ${pText(x)}, V = ${V.toFixed(2)}` }),
    ]);
  };
  return el('div', {}, [
    why('<strong>Why this plot</strong>: the same picture as the procedure page. Mendel’s two traits give splits on the dashed line — independent; Bateson’s sweet peas do not — dependent.'),
    el('div', { class: 'cols' }, [block(MENDEL, 'Mendel, peas: shape × colour'), block(SWEET, 'Bateson, sweet peas: flower × pollen')]),
  ]);
}

function fisherFigure() {
  const { chi2, df } = FISHER, low = chi2Cdf(chi2, df), crit = chi2Inv(0.95, df);
  const lo = 20, hi = 150;
  const chart = plot({
    x: { min: lo, max: hi, title: 'total χ² of Mendel’s experiments (84 df), if his data were honest chance' }, y: { min: 0, title: 'density' }, width: 560, height: 220,
    layers: [
      { type: 'shade', x0: lo, x1: chi2, color: 'var(--s1)' },
      { type: 'shade', x0: crit, x1: hi, color: 'var(--m2)' },
      { type: 'line', points: curve((v) => chi2Pdf(v, df), lo, hi, 240), color: INK },
      { type: 'vline', at: df, dash: true, color: MUTED, text: 'expected ≈ 84' },
      { type: 'vline', at: chi2, color: 'var(--s1)', text: `Mendel: ${chi2.toFixed(1)}` },
    ],
    label: `the chi-square density with 84 degrees of freedom; Mendel's total of 41.6 lies far in the left tail`,
  });
  return el('div', {}, [
    why('<strong>Why this plot</strong>: a χ² test has two tails. The right one flags data that fit <em>too badly</em> (dependence, a wrong model); the left one data that fit <em>too well</em>.'),
    chart,
    legend([['line', INK, 'what honest chance gives'], ['band', 'var(--s1)', `fits this good or better: ${(low * 1e5).toFixed(1)} in 100 000`], ['band', 'var(--m2)', 'fits this bad or worse: 5 %']]),
  ]);
}

function snowFigure() {
  const chart = barChart({ categories: SNOW.map((r) => r[0]), series: [{ label: 'cholera deaths per 10 000 houses', color: 'var(--s2)', values: SNOW.map((r) => r[3]) }], yTitle: 'deaths per 10 000 houses', width: 520, height: 210 });
  return el('div', {}, [
    why(`<strong>Why this plot</strong>: the water company was assigned to houses almost at random, like the coin of E10 on the ${link('causality.html', 'causality')} page — so a gap this large can be read as a cause.`),
    chart,
    el('p', { class: 'small', text: `Southwark & Vauxhall: ${nice(SNOW[0][2])} deaths in ${nice(SNOW[0][1])} houses; Lambeth: ${SNOW[1][2]} in ${nice(SNOW[1][1])}. A ratio of ${(SNOW[0][3] / SNOW[1][3]).toFixed(1)} to 1.` }),
  ]);
}

function storksFigure() {
  const big = STORKS.filter((c) => c[1] >= 300000), small = STORKS.filter((c) => c[1] < 300000);
  const a = STORKS.map((c) => c[1]), s = STORKS.map((c) => c[2]), b = STORKS.map((c) => c[3]);
  const rsb = correlation(s, b), ras = correlation(a, s), rab = correlation(a, b);
  const partial = (rsb - ras * rab) / Math.sqrt((1 - ras ** 2) * (1 - rab ** 2));
  const chart = plot({
    x: { min: 0, max: 32000, title: 'stork breeding pairs' }, y: { min: 0, max: 1700, title: 'births (thousands per year)' }, width: 520, height: 230,
    layers: [
      { type: 'points', points: small.map((c) => [c[2], c[3]]), color: 'var(--s1)', r: 5 },
      { type: 'points', points: big.map((c) => [c[2], c[3]]), color: 'var(--s2)', r: 7 },
    ],
    label: 'births against stork pairs in 17 European countries; the large countries have both many storks and many births',
  });
  return el('div', {}, [
    why('<strong>Why this plot</strong>: colour the countries by size and the common cause appears — the large countries (orange) have both more storks and more births.'),
    chart,
    legend([['dot', 'var(--s2)', 'area ≥ 300 000 km² (France, Germany, Italy, Poland, Spain, Turkey)'], ['dot', 'var(--s1)', 'smaller countries']]),
    el('p', { class: 'small', html: `Correlation storks–births r = ${rsb.toFixed(2)} (Matthews’ p = 0.008). Area correlates with births (${rab.toFixed(2)}) and with storks (${ras.toFixed(2)}); holding area fixed, storks–births drops to ${partial.toFixed(2)}.` }),
  ]);
}

startPage({
  shell: hw07Shell('nature.html'),
  sticky: STICKY,
  memory: MEMORY,
  render: () => [
    abstract({
      question: 'Where do independence, dependence and the confusion between association and cause show up outside a textbook?',
      findings: [
        '<strong>Heredity was the first contingency table</strong>: Mendel’s traits assort independently (χ² = 0.12); Bateson’s linked sweet-pea traits do not (V = 0.70) — and that dependence became the first genetic map.',
        '<strong>Both tails of χ² matter</strong>: Mendel’s data fit <em>too</em> well, a chance of about 3 in 100 000.',
        '<strong>Cause needs more than a table</strong>: Snow’s near-random water supply (8.5 times the deaths) vs the storks, whose correlation with births follows country size.',
        '<strong>Secrecy is independence</strong>: Shannon’s definition; Turing’s weight of evidence, the ancestor of G and of mutual information.',
      ],
      sections: [['heredity', 'Independence in heredity'], ['cause', 'Association and cause'], ['secrets', 'Secrets']],
    }),
    el('p', { class: 'notice', html: 'Labels: <strong>rigorous</strong> = the same mathematics as this homework; <strong>history</strong>; <strong>analogy</strong>. Sources checked on 18 Nov 2026; the plots use the published numbers.' }),
    anchor('heredity', card('Independence and dependence in heredity', [
      item('Mendel’s peas, and linked sweet peas', ['rigorous'],
        'Mendel crossed peas differing in seed shape and colour: in the second generation the four combinations came out about 9 : 3 : 3 : 1, the product of two independent 3 : 1 ratios — the law of independent assortment. Bateson, Saunders and Punnett found traits of the sweet pea that stay together instead; Morgan explained why (the genes sit on the same chromosome), and Sturtevant turned <em>how strongly</em> they depend into distances: the first genetic map.',
        'G. Mendel, Verhandlungen des naturforschenden Vereines in Brünn 4 (1866) 3–47 · W. Bateson, E. R. Saunders, R. C. Punnett, Reports to the Evolution Committee of the Royal Society II (1905) · T. H. Morgan, Science 34 (1911) 384 · A. H. Sturtevant, J. Exp. Zool. 14 (1913) 43–59',
        peasFigure()),
      item('Fisher: “too good to be true”', ['historical', 'rigorous'],
        `Fisher added up the χ² of Mendel’s experiments: ${FISHER.chi2} on ${FISHER.df} degrees of freedom, far below the ${FISHER.df} that honest chance gives on average. His table puts the chance of a fit this good at 7 in 100 000; the exact tail is about 3 in 100 000. How it happened is still debated — but “too regular” is a warning sign in fraud and anomaly detection too.`,
        'R. A. Fisher, “Has Mendel’s work been rediscovered?”, Annals of Science 1 (1936) 115–137 · A. M. Pires, J. A. Branco, Statistical Science 25 (2010) 545–565, Table 5 · A. Franklin et al., Ending the Mendel–Fisher Controversy, University of Pittsburgh Press (2008)',
        fisherFigure()),
    ])),
    anchor('cause', card('Association and cause', [
      item('Pearson’s χ² (1900)', ['historical'],
        `Karl Pearson introduced the χ² statistic in 1900 to ask whether observed frequencies fit a model, testing among others long records of dice throws. Fisher (1922) corrected the degrees of freedom for contingency tables to ${m`(r - 1)(c - 1)`} — the count of free cells on the ${link('theory.html', 'theory')} page.`,
        'K. Pearson, Philosophical Magazine (5th series) 50 (1900) 157–175 · R. A. Fisher, J. Royal Statistical Society 85 (1922) 87–94'),
      item('Snow and cholera (1854): a natural experiment', ['historical'],
        'In south London two water companies served the same streets: one drew its water from the Thames below the sewage outlets, the other upstream. Which company supplied a house had nothing to do with the people inside it — almost as if a coin had decided.',
        'J. Snow, On the Mode of Communication of Cholera, 2nd ed., London: John Churchill (1855), Table IX',
        snowFigure()),
      item('Smoking and lung cancer', ['historical'],
        'Doll and Hill (1950) found a strong association between smoking and lung cancer. Fisher objected that a common genetic cause could produce it — a confounder, as in E9 of the causality page. The question was settled not by one table but by converging evidence: the more cigarettes, the higher the risk; cohort studies; the biological mechanism (summarised by Bradford Hill, 1965).',
        'R. Doll, A. B. Hill, BMJ 2 (1950) 739–748 · A. B. Hill, “The environment and disease: association or causation?”, Proc. Royal Society of Medicine 58 (1965) 295–300'),
      item('Storks and babies', ['analogy'],
        'Across 17 European countries the number of stork pairs is significantly correlated with the number of births. Storks do not bring babies: the obvious suspect is a common cause.',
        'R. Matthews, “Storks deliver babies (p = 0.008)”, Teaching Statistics 22 (2000) 36–38, Table 1',
        storksFigure()),
    ])),
    anchor('secrets', card('Secrets', [
      item('Shannon: secrecy is independence', ['historical', 'rigorous'],
        `Shannon defined a perfectly secret cipher by one equation, ${m`P(M \mid C) = P(M)`}: the ciphertext is independent of the message, so seeing it teaches nothing. He proved that the one-time pad achieves it and that any such cipher needs a key at least as long as the message (see the ${link('theory.html', 'theory')} page: leakage is dependence).`,
        'C. E. Shannon, “Communication theory of secrecy systems”, Bell System Technical Journal 28 (1949) 656–715'),
      item('Turing’s weight of evidence', ['historical'],
        'At Bletchley Park, Turing scored each clue for a hypothesis by the logarithm of its likelihood ratio, in units he called bans, and added the scores up. The same quantity, summed over a table, is the G statistic of this homework, and its average is the mutual information.',
        'I. J. Good, “Studies in the history of probability and statistics XXXVII: A. M. Turing’s statistical work in World War II”, Biometrika 66 (1979) 393–396'),
    ])),
  ],
});
