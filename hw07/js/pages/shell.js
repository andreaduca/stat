/* shell.js — what the header and the tab bar say on every page of this
   homework. One place to add a page to the navigation. hw07 has no footer
   (as hw04–hw06): the honesty note is NOTICE, shown on the home page. */

/* every page, in reading order; `built` turns a page on in the tabs and in
   the home page's list as its phase is finished */
export const PAGES = [
  { href: 'index.html', label: 'Home', built: true },
  { href: 'theory.html', label: 'Theory', built: true, phase: 'P2',
    blurb: 'Independence in probability (a property of a model) and in statistics (a decision about data); why the expected counts are R·C/N, where the degrees of freedom come from, and why χ² measures the distance from independence.' },
  { href: 'procedure.html', label: 'Procedure', built: true, phase: 'P2',
    blurb: 'The assignment as an algorithm, on any dataset (Berkeley, a generator, or your own CSV): the table, its frequencies, the expected counts, χ² and its p-value, the strength of the association, and the table filling as the data arrive.' },
  { href: 'generators.html', label: 'Random generators', built: true, phase: 'P3',
    blurb: 'Independence as randomness: consecutive outputs of four generators in a 16 × 16 table. The last bits of a linear congruential generator (LCG) fail at once; its first bits pass and are still predictable. A real case: Coldcard.' },
  { href: 'berkeley.html', label: 'Berkeley 1973', built: true, phase: 'P3',
    blurb: 'An association that reverses: men were admitted more often overall, yet in no department was the gap significant against women. The pooled rate is a weighted average, and the weights differ.' },
  { href: 'causality.html', label: 'Causality', built: true, phase: 'P4',
    blurb: 'Three ways to get an association without a cause — a common cause, a mediator, a selection — what randomisation and adjustment do about them, and why a 99 % accurate alarm is mostly wrong.' },
  { href: 'side-channels.html', label: 'Side channels', built: true, phase: 'P5',
    blurb: 'A device is leak-free when its power traces are independent of the secret. Masking hides the mean but not the spread: χ² sees it, the t-test does not. A simulation.' },
  { href: 'information.html', label: 'Mutual information', built: true, phase: 'P5',
    blurb: 'Dependence measured in bits: mutual information, its G-test twin of χ², its upward bias on small samples, and the one-time pad as a table with zero information.' },
  { href: 'nature.html', label: 'Nature', built: true, phase: 'P4',
    blurb: 'Independence and its failures outside mathematics: Mendel’s peas and linked genes, Fisher’s “too good to be true”, Snow’s cholera map, storks and babies.' },
  { href: 'essay.html', label: 'Essay', built: true, phase: 'P6',
    blurb: 'The argument in prose, with the measured numbers and the evidence behind each claim.' },
];

/** Shell arguments for one page of hw07. @param {string} current its filename */
export const hw07Shell = (current) => ({
  title: 'HW07 · Statistical independence',
  subtitle: 'Contingency tables, χ², and association vs causality',
  links: PAGES.filter((p) => p.built),
  current,
  home: '../index.html',
  footer: false,   // no site footer, as hw04–hw06; NOTICE is on the home page
});

/** The honesty note, shown once on the home page. */
export const NOTICE = 'An educational project. Every number is computed in your browser; the Berkeley counts are the published 1973 data, everything else is simulated with a seeded, non-cryptographic generator (xoshiro128**), so any run can be reproduced from its seed. The weak generators and the side-channel traces are deliberate, labelled simulations. A CSV you load is read on your device and never leaves it.';

/* What the pages share: the seed of every simulation. */
export const STICKY = ['seed'];
export const MEMORY = 'hw07';
