/* shell.js — what the header, the tab bar and the footer say on every page of
   this homework. One place to add a page to the navigation. */

const LINKS = [
  { href: 'index.html',      label: 'Overview' },
  { href: 'curve.html',      label: 'The curve' },
  { href: 'keygen.html',     label: 'Key generation' },
  { href: 'visualiser.html', label: 'Visualiser' },
];

/** Shell arguments for one page of hw01. @param {string} current its filename */
export const hw01Shell = (current) => ({
  title: 'HW01 · From a private key to a public key',
  subtitle: 'Elliptic-curve scalar multiplication on a toy curve',
  links: LINKS,
  current,
  home: '../index.html',
  notice: 'Educational toy. Never paste a real private key. Nothing leaves your browser.',
});
