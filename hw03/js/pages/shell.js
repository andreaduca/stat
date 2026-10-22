/* shell.js — what the header, the tab bar and the footer say on every page
   of this homework. One place to add a page to the navigation. */

/* a page is added here when it is built */
const LINKS = [
  { href: 'index.html', label: 'Home' },
  { href: 'ecc.html', label: 'Toy ECC' },
];

/** Shell arguments for one page of hw03. @param {string} current its filename */
export const hw03Shell = (current) => ({
  title: 'HW03 · Caesar vs toy EC-ElGamal',
  subtitle: 'Where insecurity comes from: key space or statistics',
  links: LINKS,
  current,
  home: '../index.html',
  notice: 'Educational toy: the private keys here are deliberately small, the code is not constant-time and the textbook scheme is malleable. Never use it to protect anything. Everything runs in your browser; nothing is sent anywhere.',
});
