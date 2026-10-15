/* shell.js — what the header, the tab bar and the footer say on every page
   of this homework. One place to add a page to the navigation. */

/* Spec §6.0 order; a page is added here when it is built. */
const LINKS = [
  { href: 'index.html', label: 'Home' },
  { href: 'pipeline.html', label: 'Pipeline' },
  { href: 'bip39.html', label: 'BIP-39' },
  { href: 'bip32.html', label: 'BIP-32/44' },
  { href: 'address.html', label: 'Address & EIP-55' },
  { href: 'history.html', label: 'History & hashes' },
  { href: 'primitives.html', label: 'Why many primitives' },
  { href: 'stats.html', label: 'Statistics lab' },
];

/** Shell arguments for one page of hw02. @param {string} current its filename */
export const hw02Shell = (current) => ({
  title: 'HW02 · From wallet seed to Ethereum address',
  subtitle: 'The cryptographic pipeline of an Ethereum wallet, step by step',
  links: LINKS,
  current,
  home: '../index.html',
  footer: false,   // no site footer on hw02: the safety notes live on the home page and the input card
});
