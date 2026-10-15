/* primitives-page.js — Why many primitives: the category matrix (each step,
   the question it answers, whether it involves a secret, is reversible or
   keyed), what each primitive provides that no other can, what would break
   without it, where algebraic structure is needed and where it is removed on
   purpose, and the confusions to avoid. Note 01. */

import { el } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { stepCard, badge } from './widgets.js';
import { hw02Shell } from './shell.js';

const table = (head, rows, cls = 'data compare prose') => el('div', { class: 'scroll-x' }, [el('table', { class: cls }, [
  el('thead', {}, [el('tr', {}, head.map((h) => el('th', { class: 'left', text: h })))]),
  el('tbody', {}, rows.map((cells) => el('tr', {}, cells.map((c) => el('td', { class: 'left' }, [].concat(c)))))),
])]);
const link = (href, text) => (href ? el('a', { href, text }) : text);

/* ---------- the matrix ---------- */

const STEPS = [
  ['entropy', 'pipeline.html#step-1', 'CSPRNG, 128–256 bits', 'generation', 'Where does the unpredictability come from?', 'creates it', '—', 'no'],
  ['entropy → words', 'pipeline.html#step-1', 'append SHA-256 bits, split into 11-bit groups', 'encoding', 'How do people copy it and catch slips?', 'carries it', 'yes, by anyone', 'no'],
  ['words → seed', 'pipeline.html#step-2', 'PBKDF2-HMAC-SHA512, 2048 rounds', 'derivation', 'How is a phrase stretched into a 512-bit seed?', 'in and out', 'no', 'optional passphrase'],
  ['seed → master key', 'pipeline.html#step-3', 'HMAC-SHA512("Bitcoin seed", seed)', 'derivation', 'How does the seed become a curve key + chain code?', 'in and out', 'no', 'fixed public string'],
  ['master → child keys', 'pipeline.html#step-4', 'HMAC-SHA512(chain code, …), + mod n', 'derivation', 'How does one secret become many, deterministically?', 'in and out', 'no', 'chain code'],
  ["path m/44'/60'/0'/0/i", 'bip32.html', 'a convention (BIP-44)', 'derivation', 'Which node of the tree is which account?', 'none (a map)', '—', '—'],
  ['k → Q = kG', 'pipeline.html#step-5', 'scalar multiplication on secp256k1', 'publickey', 'How can others verify without being able to act?', 'private in, public out', 'no (one-way)', 'no'],
  ['Q → address', 'pipeline.html#step-6', 'Keccak-256, last 20 bytes', 'hashing', 'How do I get a short identifier with no structure?', 'none', 'no', 'no'],
  ['address → EIP-55', 'pipeline.html#step-7', 'Keccak-256 of the hex text sets the case', 'checksum', 'How do I catch a typo without changing the format?', 'none', 'yes (it is still the address)', 'no'],
  ['signing a transaction', 'structure.html?exp=S9', 'ECDSA with k and a nonce', 'publickey', 'How do I prove I hold k without revealing it?', 'private key', 'no', 'private key'],
];

function matrixPanel() {
  return stepCard({
    title: 'The category matrix', cats: [],
    body: table(['step', 'operation', 'category', 'question it answers', 'secret involved', 'reversible', 'keyed'],
      STEPS.map(([step, href, op, cat, q, secret, rev, keyed]) => [link(href, step), op, badge(cat), q, secret, rev, keyed])),
    why: 'the steps look alike — bits in, bits out — but each answers a different question, and confusing them is the commonest mistake in writing about wallets.',
    notes: [
      '<strong>Generation</strong> is the only row that creates unpredictability. Every row below it is a deterministic function, so it cannot add entropy: <span class="eq">H(f(X)) ≤ H(X)</span>. A 12-word wallet has at most 128 bits of security, however many 256- and 512-bit values follow.',
      '<strong>Derivation</strong> is deterministic on purpose: the backup is made once, and every key can be recomputed forever, on any compatible wallet.',
      '<strong>Encoding</strong> is reversible by anyone — the words <em>are</em> the entropy, written differently. <strong>Hashing</strong> and <strong>public-key</strong> steps are one-way; a <strong>checksum</strong> only adds redundancy.',
    ],
  });
}

/* ---------- requirements ---------- */

function requirementsPanel() {
  const rows = [
    ['human backup and recovery', 'BIP-39', 'Raw 256-bit hex is unusable for people; words with a checksum and four-letter-unique spelling are not.'],
    ['many keys from one backup; accounts; watch-only', 'BIP-32 / BIP-44', 'A hash of the seed gives one key. BIP-32 gives a tree, and its normal branches let an xpub derive public keys without any private key — which needs the curve’s homomorphism, not a hash.'],
    ['anyone can verify, only the owner can sign', 'secp256k1 + ECDSA', 'A hash has no public/private pair; a MAC needs a shared secret, impossible with millions of anonymous verifiers.'],
    ['a short, uniform identifier that hides Q until first use', 'Keccak-256', 'The public key is 64 structured bytes (y is fixed by x up to sign); a hash compresses and erases that structure.'],
    ['catch typos without changing the format', 'EIP-55', 'Hashes and signatures defend against adversaries; a checksum is cheap redundancy against accidents, squeezed into letter case so old software still reads the address.'],
    ['make guessing a weak secret expensive', 'PBKDF2 (2048 rounds)', 'A single hash is cheap to guess against; stretching multiplies the cost of every candidate by 2048.'],
  ];
  return stepCard({
    title: 'Why not one algorithm for everything?', cats: [],
    body: table(['requirement', 'who provides it', 'why the others cannot'], rows),
    why: 'each step must have a property the others cannot — or must not — provide.',
    notes: [
      'This is separation of concerns: each primitive has one job and one clear assumption, so a failure stays local. A bug in EIP-55 casing never leaks a key; a hash collision does not allow signing; a weak passphrase does not break secp256k1.',
      'Each primitive also rests on a different assumption — the discrete logarithm for secp256k1, the one-wayness and collision resistance of two unrelated hash designs, the quality of the random generator — so no single breakthrough takes down every layer.',
    ],
  });
}

/* ---------- what would break ---------- */

const BREAKS = [
  ['generation', 'Use a predictable generator for the entropy', 'Every later step still works and every phrase is valid — and every key can be enumerated. This is the 2026 Coldcard failure.', 'bip39.html', 'the forgotten-word search shows how fast low entropy falls'],
  ['encoding', 'Back up raw hex instead of BIP-39 words', 'No checksum: a mis-copied character silently opens a different, empty wallet; 64 hex digits are also much harder to copy than 12 words.', 'bip39.html', 'checksum checker'],
  ['derivation', 'Hash the phrase once instead of 2048 PBKDF2 rounds', 'Guessing a forgotten word or a weak passphrase becomes 2048 times cheaper: 11 bits of work lost.', 'bip39.html', 'stretching panel'],
  ['derivation', 'Drop BIP-32 and use independent random keys', 'One backup per key — the original Bitcoin “bag of keys”, where restoring an old backup lost the newer addresses. No watch-only wallets.', 'bip32.html', 'key tree and watch-only demo'],
  ['derivation', 'Derive every level normally, never hardened', 'One leaked key plus one xpub high in the tree gives the parent key, then everything below it — other accounts, other coins.', 'bip32.html', 'leak demo'],
  ['derivation', 'No standard path (no BIP-44)', 'The same words show different accounts in different wallets, and users conclude their funds are gone.', 'bip32.html', 'three wallets side by side'],
  ['publickey', 'Use a hash instead of secp256k1', 'No public verification: a hash has no public key, so checking a “signature” would need the secret itself.', 'pipeline.html#step-5', 'step 5'],
  ['hashing', 'Use the raw public key as the address', '64 bytes instead of 20, and Q is exposed before first use, so the curve alone protects even unused addresses.', 'address.html', 'exposure panel'],
  ['checksum', 'Skip EIP-55', 'A single typo goes undetected every time instead of 0.0247 % of the time; funds go to a key nobody holds.', 'address.html', 'typo playground'],
];

function breaksPanel() {
  return stepCard({
    title: 'What would break if…', cats: [],
    body: el('div', { class: 'breaks' }, BREAKS.map(([cat, title, what, href, where]) => el('div', { class: 'break' }, [
      el('div', { class: 'step-head', style: 'margin-bottom:4px' }, [badge(cat)]),
      el('p', { style: 'margin:0 0 4px' }, [el('strong', { text: title })]),
      el('p', { class: 'small', style: 'margin:0 0 4px', text: what }),
      el('p', { class: 'small muted', style: 'margin:0' }, ['See it: ', link(href, where)]),
    ]))),
    why: 'the clearest way to see what a primitive is for is to take it away.',
    notes: [
      'Every card names a failure that is either measurable in this app (follow the link) or a matter of historical record. None of them requires breaking a primitive: they come from removing one, or from using it where another belongs.',
    ],
  });
}

/* ---------- structure ---------- */

function structurePanel() {
  const rows = [
    ['signing and verifying (ECDSA)', 'yes', 'The relation Q = kG and (a + b)G = aG + bG are what make verification by strangers possible.'],
    ['normal BIP-32 derivation from an xpub', 'yes', 'Kᵢ = I_L·G + K_par: public children from public data — the watch-only wallet.'],
    ['hardened BIP-32 derivation', 'removed on purpose', 'The parent private key enters the HMAC, so the linear leak k_par = kᵢ − I_L cannot even be written down.'],
    ['address', 'removed on purpose', 'Keccak-256 destroys the algebra, so the address reveals nothing usable about Q until Q is published.'],
    ['PBKDF2 seed, HMAC master key', 'none wanted', 'A derivation should behave like a random function: any structure would be a shortcut for an attacker.'],
    ['BIP-39 and EIP-55 checksums', 'none needed', 'Only redundancy is wanted, and a hash supplies it.'],
  ];
  return stepCard({
    title: 'Where structure is used, and where it is removed', cats: ['publickey', 'hashing'],
    body: table(['step', 'algebraic structure?', 'why'], rows),
    why: 'structure is what makes public-key cryptography work — and it is also attack surface.',
    notes: [
      'The linearity of the curve is a feature twice (verification, watch-only wallets) and a bug once (the xpub + child-key leak, and in ECDSA the nonce-reuse attack). The pipeline uses structure exactly where it is needed and hashes it away everywhere else.',
      'This table is the starting point of the “structure vs hashes” question: is structured cryptography such as ECDSA more at risk than hash-based constructions against a much stronger mathematician? The Structure & AI page takes it up with small simulations.',
    ],
  });
}

/* ---------- confusions ---------- */

function confusionsPanel() {
  const items = [
    ['“The address is the public key.”', 'It is a hash of the public key. The public key becomes visible only after the first signed transaction, recovered from the signature.'],
    ['“The mnemonic is encrypted.”', 'It is an encoding of the entropy plus a checksum. Anyone holding the words owns the funds.'],
    ['“EIP-55 makes addresses secure.”', 'It detects typos. It has no secret, so an attacker can produce a valid casing for any look-alike address.'],
    ['“Keccak-256 is SHA-3.”', 'Almost: same permutation, different padding byte, unrelated outputs.'],
    ['“BIP-32 is encryption.”', 'It is key derivation. The chain code is the extra secret that stops a public key alone from revealing its children.'],
    ['“24 words make secp256k1 stronger.”', 'The discrete logarithm costs about 2¹²⁸ either way; 24 words only add margin on the entropy side.'],
  ];
  return stepCard({
    title: 'Common confusions', cats: [],
    body: el('ul', { class: 'confusions' }, items.map(([wrong, right]) => el('li', {}, [el('strong', { text: wrong }), ' ', right]))),
    why: 'each of these sentences appears in published articles about wallets, and each mixes up two categories of the matrix above.',
  });
}

startPage({
  shell: hw02Shell('primitives.html'),
  render: () => [matrixPanel(), requirementsPanel(), breaksPanel(), structurePanel(), confusionsPanel()],
});
