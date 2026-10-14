/* shell.js — the header, navigation and footer shared by the hw01 pages.
   One place to add a page to the tab bar. */

import { mountShell } from '../../../assets/js/ui/dom.js';

const LINKS = [
  { href: 'index.html',      label: 'Overview' },
  { href: 'curve.html',      label: 'The curve' },
  { href: 'keygen.html',     label: 'Key generation' },
  { href: 'visualiser.html', label: 'Visualiser' },
];

export function shell(current) {
  mountShell({
    title: 'HW01 · From a private key to a public key',
    subtitle: 'Elliptic-curve scalar multiplication on a toy curve',
    links: LINKS,
    current,
    home: '../index.html',
  });
}
