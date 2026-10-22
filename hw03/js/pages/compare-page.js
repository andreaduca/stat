/* compare-page.js — the Compare page: Caesar and toy EC-ElGamal side by side,
   the same message under both ciphers as histograms, the 2 × 2 table of
   key space against statistical leakage, which weaknesses come from the key
   space and which from the design, and the curve y² = x³ + 7 over 𝔽₉₇ as an
   illustration. Uses the maths of ../core/caesar.js and ../core/elgamal.js. */

import { el, explain, fmt } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { LatticeGrid, legend } from '../../../assets/js/ui/grid.js';
import { PrimeField } from '../../../assets/js/core/field.js';
import { EllipticCurve } from '../../../assets/js/core/curve.js';
import { chiSquare, shannonEntropy } from '../../../assets/js/core/stats.js';
import { ALPHABET, encrypt as caesarEncrypt, normalise, letterCounts, frequencies, letterEntropy } from '../core/caesar.js';
import { encrypt, ciphertextBytes } from '../core/elgamal.js';
import { loadModel } from '../core/data.js';
import { facts, chart } from './widgets.js';
import { readKey } from './toykey.js';
import { hw03Shell, STICKY, MEMORY } from './shell.js';

const CAESAR_K = 3;
const pct = (x) => `${(100 * x).toFixed(1)} %`;

/* ---------- input ---------- */

function inputCard(s, model, update) {
  return el('div', { class: 'card' }, [
    el('div', { class: 'row' }, [
      el('button', { type: 'button', text: '“ATTACK AT DAWN”', onclick: () => update({ msg: 'ATTACK AT DAWN' }) }),
      el('button', { type: 'button', text: `A paragraph of ${model.sample.source.split(', ')[1]}`, onclick: () => update({ msg: model.sample.text }) }),
    ]),
    el('p', { class: 'small muted', style: 'margin:10px 0 0', html:
      `The comparison uses the message and the toy key shared by all pages: “${escapeHtml(s.msg.length > 60 ? `${s.msg.slice(0, 60)}…` : s.msg)}”, d ≤ 2^${s.bits}. ` +
      'Change them on the <a href="ecc.html">Toy ECC</a> or <a href="caesar.html">Caesar</a> page, or load one of the two texts here.' }),
  ]);
}
const escapeHtml = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 1. side by side ---------- */

function sideBySide(s) {
  const rows = [
    ['type', 'symmetric, classical: one shared key', 'public-key: anyone encrypts with Q, only the holder of d decrypts'],
    ['keys', 'one secret k ∈ ℤ₂₆, known to both sides', 'private d, public Q = dG, and a fresh secret nonce k per message'],
    ['the group', '(ℤ₂₆, +): 26 elements', '(E(𝔽ₚ), +): n ≈ 2²⁵⁶ points'],
    ['encryption', 'cᵢ = mᵢ + k for every letter', 'C₁ = kG, C₂ = M + kQ for every message chunk'],
    ['decryption', 'mᵢ = cᵢ − k', 'M = C₂ − dC₁, because dC₁ = d(kG) = k(dG) = kQ'],
    ['the mask added', 'the same k, reused for every letter', 'S = kQ, new and secret every time (Diffie–Hellman)'],
    ['deterministic?', 'yes: same letter, same ciphertext letter', 'no: the same message gives a new ciphertext every time'],
    ['key space', `26 keys ≈ 4.7 bits`, `toy: 2^${s.bits} keys; real: ≈ 2²⁵⁶`],
    ['what leaks', 'letter frequencies (shifted), repeats, word lengths', 'nothing visible: the ciphertext bytes look uniform'],
    ['the attack', 'try all 26 keys, recognise English statistically', 'search the key space, test d′G = Q exactly'],
    ['what it needs', 'enough ciphertext letters', 'only the public key — no ciphertext at all'],
    ['what makes it work', 'the redundancy of the language', 'the smallness of the key space'],
    ['when it fails', 'the text is too short or not typical English', 'the key space is too large: N/2 or √N steps out of reach'],
  ];
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Side by side' }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data prose compare side' }, [
      el('thead', {}, [el('tr', {}, [el('th', { class: 'left', text: '' }), el('th', { class: 'left', text: 'Caesar' }), el('th', { class: 'left', text: 'toy EC-ElGamal' })])]),
      el('tbody', {}, rows.map(([k, a, b]) => el('tr', {}, [el('th', { class: 'left', scope: 'row', text: k }), el('td', { class: 'left', 'data-label': 'Caesar', text: a }), el('td', { class: 'left', 'data-label': 'toy EC-ElGamal', text: b })]))),
    ])]),
    explain([
      'The deep similarity is exact, not an analogy: both schemes compute <span class="eq">ciphertext = message + mask</span> in a finite abelian group. They differ in the group (26 elements against about 2²⁵⁶), in how the mask is chosen (one fixed number for every letter, against a fresh point for every message), and in how hard it is to compute the mask from public data.',
      'The deep difference is where each one breaks. Caesar breaks through <em>recognition</em>: searching 26 keys is free, and the work is telling English from noise. The toy ECC breaks through <em>search</em>: recognising the key is exact and free, and the work is the number of candidates.',
    ]),
  ]);
}

/* ---------- 2. the same message, two ciphertexts ---------- */

function histogramsPanel(s) {
  const caesarCt = caesarEncrypt(s.msg, CAESAR_K);
  const lc = letterCounts(normalise(caesarCt)), n = lc.reduce((a, b) => a + b, 0);
  // ECC: keep encrypting the same message until there are enough bytes to see a shape
  const bytes = [];
  let encryptions = 0;
  while (bytes.length < 4096 || encryptions < 1) { bytes.push(...ciphertextBytes(encrypt(s.Q, s.msg))); encryptions++; }
  const bc = new Array(256).fill(0);
  for (const b of bytes) bc[b]++;
  const Hl = letterEntropy(lc), Hb = shannonEntropy(bc.map((c) => c / bytes.length));
  const chi = chiSquare(bc);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The same message, two ciphertexts' }),
    n < 100 ? el('p', { class: 'notice', text: `The message has only ${n} letters, too few for a letter histogram to take shape. Load the paragraph above for a clearer picture.` }) : null,
    el('div', { class: 'cols' }, [
      el('div', {}, [
        el('h3', { text: `Caesar ciphertext, k = ${CAESAR_K}: letters` }),
        chart({ categories: [...ALPHABET], series: [{ label: 'ciphertext letters', color: 'var(--s1)', values: frequencies(lc).map((x) => 100 * x) }], yTitle: '% of letters', height: 200 }),
        facts([
          ['letters', String(n)],
          ['entropy', `${Number.isFinite(Hl) ? Hl.toFixed(2) : '—'} of max ${Math.log2(26).toFixed(2)} bits/letter (${Number.isFinite(Hl) ? pct(Hl / Math.log2(26)) : '—'})`],
        ]),
      ]),
      el('div', {}, [
        el('h3', { text: 'EC-ElGamal ciphertext: bytes' }),
        chart({ categories: bc.map((_, i) => i), series: [{ label: 'ciphertext bytes', color: 'var(--s2)', values: bc }], refLines: [{ y: bytes.length / 256, label: 'uniform' }], yTitle: 'count', height: 200 }),
        facts([
          ['bytes', `${fmt(bytes.length)} (${encryptions} encryption${encryptions > 1 ? 's' : ''} of the same message)`],
          ['entropy', `${Hb.toFixed(2)} of max 8 bits/byte (${pct(Hb / 8)})`],
          ['χ² against uniform', `p = ${chi.p.toFixed(2)}`],
        ]),
      ]),
    ]),
    explain([
      'Left: the Caesar ciphertext’s letter histogram has the shape of English, only moved k places along — the shape is what the statistical attack reads. Its entropy is that of English letters, about 4.2 of the possible 4.7 bits per letter, whatever the key.',
      'Right: the ElGamal ciphertext bytes (the x and y coordinates of C₁ and C₂, without the 02/03 prefix byte) sit flat on the uniform line, close to 8 bits per byte, and a χ² test finds no departure from uniform. Encrypting the same message again and again only adds more flat noise, because each encryption uses a fresh mask.',
      'PRACTICE: This is the statistical meaning of IND-CPA security: the ciphertext of a chosen message is indistinguishable from random, so no histogram, no index of coincidence and no n-gram score has anything to work with.',
    ]),
  ]);
}

/* ---------- 3. the 2 × 2 table ---------- */

function quadrantPanel(s) {
  const cell = (cls, title, body, link) => el('div', { class: `quad ${cls}` }, [
    el('strong', { text: title }), el('p', { class: 'small', html: body }), link ? el('a', { href: link[0], class: 'small', text: link[1] }) : null,
  ]);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Two independent ways to fail' }),
    el('div', { class: 'quad-wrap' }, [
      el('div', { class: 'quad-axis top' }, [el('span', { text: 'small key space' }), el('span', { text: 'large key space' })]),
      el('div', { class: 'quad-grid' }, [
        el('div', { class: 'quad-axis side', text: 'statistics leak' }),
        cell('bad', 'Caesar', '26 keys, and the letter shape survives: broken twice over.', ['caesar.html', 'Caesar page →']),
        cell('bad', 'Monoalphabetic substitution', 'Any permutation of the alphabet: 26! ≈ 4·10²⁶ ≈ 2⁸⁸ keys, far too many to try — and still broken by letter and n-gram frequencies.', null),
        el('div', { class: 'quad-axis side', text: 'no statistics leak' }),
        cell('bad', `Toy EC-ElGamal (d ≤ 2^${s.bits})`, 'The ciphertext looks uniform, but the private key is found by search from the public key alone.', ['break-ecc.html', 'Break toy ECC →']),
        cell('good', 'Properly configured ECC', 'd and k uniform in [1, n − 1], n ≈ 2²⁵⁶: nothing to count and nothing to search.', null),
      ]),
    ]),
    explain([
      'A cipher can fail because its key space is small enough to search, or because its ciphertext carries the statistics of the plaintext. The two are independent, and a secure scheme must avoid both.',
      'A large key space alone is not enough: the general substitution cipher has about 2⁸⁸ keys, far more than DES’s 2⁵⁶, yet frequency analysis breaks it. Hiding the statistics alone is not enough either: the toy ElGamal hides them perfectly and still falls because its private key has only 2^bits values.',
      'Only the bottom-right cell is safe — and only against these two kinds of attack. The next table lists what else can go wrong.',
    ]),
  ]);
}

/* ---------- 4. key space or design? ---------- */

const WEAKNESSES = [
  ['The private key d is drawn from a small range', 'key space', 'yes — the deliberate toy restriction', 'draw d uniformly from [1, n − 1] with a CSPRNG'],
  ['The nonce k is drawn from a small range', 'key space (of the nonce)', 'no — k is full size', 'draw k uniformly from [1, n − 1] with a CSPRNG'],
  ['The same nonce k is used for two messages', 'design / use', 'no — a fresh k for every chunk', 'a new k for every encryption, never stored'],
  ['Each character is encrypted separately under one k, so equal letters give equal points', 'design', 'no — 29-byte chunks, each with its own k', 'encrypt whole messages; better, the hybrid form (ECIES/HPKE)'],
  ['The nonce comes from a predictable generator', 'implementation', 'no — crypto.getRandomValues', 'a cryptographically secure generator only'],
  ['The ciphertext can be altered without the key and still decrypts', 'design: no integrity', 'yes — textbook ElGamal is malleable', 'authenticated hybrid encryption (an AEAD such as AES-GCM)'],
  ['Points received from outside are not checked', 'design: no input validation', 'no — C₁ and C₂ are validated before use', 'check every received point is on the curve and not 𝒪'],
  ['Running time depends on the secret key', 'implementation', 'yes — the code is not constant-time', 'constant-time scalar multiplication (e.g. a Montgomery ladder)'],
];

function weaknessPanel() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Key space or design? Where each weakness comes from' }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data prose compare weak' }, [
      el('thead', {}, [el('tr', {}, ['weakness', 'cause', 'in this toy?', 'fix'].map((h) => el('th', { class: 'left', text: h })))]),
      el('tbody', {}, WEAKNESSES.map(([w, c, toy, fix]) => el('tr', {}, [
        el('td', { class: 'left what', text: w }),
        el('td', { class: `left cause ${c.startsWith('key') ? 'ks' : c.startsWith('impl') ? 'impl' : 'design'}`, 'data-label': 'cause', text: c }),
        el('td', { class: `left ${toy.startsWith('yes') ? 'diff' : 'same'}`, 'data-label': 'in this toy', text: toy }),
        el('td', { class: 'left', 'data-label': 'fix', text: fix }),
      ]))),
    ])]),
    explain([
      'Only the first two rows are about the size of a key space, and only they are cured by a larger key. Every other row survives a 256-bit key unchanged: a reused or predictable nonce, encrypting letter by letter, missing integrity, missing point validation and secret-dependent timing are properties of the design or the code, not of the key length.',
      'Three of them describe this toy: the restricted d (on purpose — it is the subject of the homework), the malleability of textbook ElGamal, and the lack of constant-time code. The others were avoided by construction: full-size fresh nonces from the CSPRNG, multi-byte chunks, and validated points.',
      'Character-by-character encryption under one nonce deserves a sentence of its own: it would give every equal letter the same ciphertext point, turning the scheme back into a substitution cipher — the Caesar problem again, in a much larger group. The size of the group would not help, for the reason the 2 × 2 table gives.',
      'PRACTICE: Nonce failures are the classic way elliptic-curve keys are lost in practice, mostly in ECDSA signatures rather than encryption — the 2010 PS3 signing key and the 2013 Android Bitcoin wallets are the usual examples (check the primary sources before citing details).',
    ]),
  ]);
}

/* ---------- 5. what a curve looks like (illustration) ---------- */

function curvePanel() {
  const c = new EllipticCurve(new PrimeField(97n), 0n, 7n, 'y² = x³ + 7 mod 97');
  const points = c.points();
  const grid = new LatticeGrid({ modulus: 97, size: 460, onHover: (pt) => `(${pt.x}, ${pt.y})` });
  grid.svg.setAttribute('role', 'img');
  grid.svg.setAttribute('aria-label', `scatter plot of the ${points.length} points of y² = x³ + 7 over the field with 97 elements`);
  grid.r = 2.6;      // the default shrinks dots with p (85/p ≈ 0.9 px here); 78 points can afford bigger ones
  grid.setPoints(points.map((P) => ({ x: Number(P.x), y: Number(P.y) })));
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Illustration: the same equation over a tiny field' }),
    el('p', { class: 'notice', text: 'Illustration only: this is y² = x³ + 7 over 𝔽₉₇, not secp256k1. secp256k1 uses the same equation modulo a 78-digit prime and has about 10⁷⁷ points, which cannot be drawn.' }),
    el('div', { class: 'cols wide-first' }, [
      el('div', {}, [grid.element, legend([['point', 'curve point (x, y)'], ['axis', 'symmetry line y = p/2']])]),
      facts([
        ['field', '𝔽₉₇: arithmetic mod 97'],
        ['affine points', String(points.length)],
        ['group order, with 𝒪', `${c.order()} — a prime, so (as on secp256k1, cofactor 1) every point except 𝒪 generates the whole group`],
        ['secp256k1, for comparison', 'p ≈ 2²⁵⁶, n ≈ 1.16·10⁷⁷ points'],
      ]),
    ]),
    explain([
      'Each dot is a pair (x, y) with y² ≡ x³ + 7 (mod 97). Over a finite field the “curve” is this scattered set of lattice points; the smooth picture exists only over the real numbers. The chord-and-tangent addition still works on it, and every ElGamal operation on the other pages is that addition, on a set of about 10⁷⁷ such points.',
      'The picture is symmetric about y = 97/2 because y and 97 − y have the same square: those pairs are P and −P, the inverse used in decryption, M = C₂ − S.',
    ]),
  ]);
}

/* ---------- the page ---------- */

startPage({
  shell: hw03Shell('compare.html'),
  sticky: STICKY,
  memory: MEMORY,
  render: async ({ state, update, patch }) => {
    const model = await loadModel();
    const s = readKey(state, patch);
    return [inputCard(s, model, update), sideBySide(s), histogramsPanel(s), quadrantPanel(s), weaknessPanel(), curvePanel()];
  },
});
