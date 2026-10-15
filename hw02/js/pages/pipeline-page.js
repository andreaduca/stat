/* pipeline-page.js — the pipeline explorer: the seven steps from entropy to
   checksummed address, one card each, with every intermediate value. Reveal
   mode keeps the values of the moment it was switched on and marks, in every
   later card, what a change of input altered and how many bits flipped. */

import { el, field, explain, fmt } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { bytesToHex, bytesToBits } from '../core/bytes.js';
import { sha256 } from '../core/sha256.js';
import { PBKDF2_ITERATIONS } from '../core/bip39.js';
import { BIP44_LEVELS, INVALID_CHILD_PROBABILITY, keyHex } from '../core/bip32.js';
import { compressedHex, uncompressedHex, ethereumHex } from '../core/secp256k1.js';
import { loadWallet, walletInput, useHexEntropy, WALLET_KEYS, WALLET_MEMORY } from './wallet-input.js';
import { hexValue, stepCard, facts } from './widgets.js';
import { hw02Shell } from './shell.js';

let baseline = null;   // reveal mode: the values when it was switched on (or reset)

/** Every value a card shows, flattened, so two runs can be compared. */
function snapshot(run) {
  return {
    entropy: bytesToHex(run.entropy),
    words: run.mnemonic.words,
    seed: bytesToHex(run.seed),
    master: keyHex(run.master.privateKey),
    chain: bytesToHex(run.master.chainCode),
    levels: run.trace.map((t) => ({ data: bytesToHex(t.hmacData), IL: bytesToHex(t.IL), k: keyHex(t.childKey), c: bytesToHex(t.IR) })),
    k: keyHex(run.node.privateKey),
    x: ethereumHex(run.account.Q).slice(0, 64),
    y: ethereumHex(run.account.Q).slice(64),
    compressed: compressedHex(run.account.Q),
    uncompressed: uncompressedHex(run.account.Q),
    keccak: bytesToHex(run.account.keccak),
    eip: run.checksum.checksummed.slice(2),
  };
}

/* ---------- reveal mode controls ---------- */

function revealRow(state, update, wallet) {
  const on = state.reveal === '1';
  const toggle = el('label', { class: 'small', style: 'display:flex;gap:6px;align-items:center;min-height:34px' }, [
    el('input', { type: 'checkbox', checked: on, onchange: (e) => { baseline = null; update({ reveal: e.target.checked ? '1' : null }); } }),
    'Reveal mode: mark what changes',
  ]);
  if (!on) return el('div', { class: 'row', style: 'margin-top:12px' }, [toggle]);

  const bits = wallet.bytes * 8;
  const bitInput = el('input', { type: 'number', class: 'num', min: 0, max: bits - 1, value: '0', id: 'in-flip' });
  const flip = () => {
    if (!wallet.entropy) return;
    const b = Math.max(0, Math.min(bits - 1, parseInt(bitInput.value, 10) || 0));
    const bytes = wallet.entropy.slice();
    bytes[b >> 3] ^= 0x80 >> (b & 7);              // bit 0 is the most significant bit of byte 0
    useHexEntropy(bytesToHex(bytes));
    update({ src: 'hex' });
  };
  return el('div', { class: 'row', style: 'margin-top:12px' }, [
    toggle,
    el('div', { class: 'vrule' }),
    field(`entropy bit (0–${bits - 1})`, bitInput),
    el('button', { type: 'button', text: 'Flip that bit', onclick: flip }),
    el('button', { type: 'button', text: 'Index + 1', onclick: () => update({ index: String(wallet.index + 1) }) }),
    el('button', { type: 'button', text: 'Take current values as baseline', onclick: () => { baseline = null; update({}); } }),
  ]);
}

/* ---------- the seven cards ---------- */

function entropyCard(run, base) {
  const { mnemonic, entropy } = run;
  const entBits = entropy.length * 8, cs = mnemonic.checksum.length;
  const all = bytesToBits(entropy) + mnemonic.checksum;
  const hash = bytesToHex(sha256(entropy));

  const groups = mnemonic.words.map((word, j) => {
    const bits = [...all.slice(11 * j, 11 * j + 11)].map((b, i) =>
      (11 * j + i >= entBits ? el('span', { class: 'cs', text: b }) : b));
    const changed = base && base.words.length === mnemonic.words.length && base.words[j] !== word;
    return el('div', { class: `grp${changed ? ' chg' : ''}` }, [
      el('div', { class: 'bits' }, bits),
      el('div', { class: 'meta' }, [el('span', { class: 'n', text: `${j + 1}. #${mnemonic.indices[j]}` }), el('span', { class: 'word', text: word })]),
    ]);
  });
  const changedWords = base && base.words.length === mnemonic.words.length
    ? mnemonic.words.filter((w, j) => w !== base.words[j]).length : null;

  return stepCard({
    no: 1, id: 'step-1', title: 'Entropy → mnemonic words', cats: ['generation', 'encoding'],
    formula: `bits = entropy ‖ SHA-256(entropy)[first ${cs} bits] &nbsp;→&nbsp; ${mnemonic.words.length} groups of 11 bits &nbsp;→&nbsp; word = list[group]`,
    body: [
      hexValue('entropy (the only random input)', bytesToHex(entropy), { base: base?.entropy }),
      el('p', { class: 'small', html: `SHA-256(entropy) = <span class="eq">${hash.slice(0, 8)}…</span>; its first ${cs} bits <span class="key-cs">${mnemonic.checksum}</span> are appended as the checksum (underlined below). ${entBits} + ${cs} = ${entBits + cs} bits = ${mnemonic.words.length} × 11.` }),
      el('div', { class: 'groups' }, groups),
      changedWords !== null ? el('p', { class: 'small', style: 'margin-top:8px', html: `<strong>${changedWords}</strong> of ${mnemonic.words.length} words differ from the baseline.` }) : null,
    ],
    why: 'people cannot copy 128 random bits reliably, but they can copy twelve words — and the checksum catches most slips.',
    notes: [
      'Each word is one digit of the entropy written in base 2048: 11 bits, an index into the official list of 2048 words. The list is chosen so that the first four letters identify every word, which is why steel backup plates have room for four letters only. Nothing is hidden by this step — anyone can turn the words back into the bits.',
      `The last word is special: it holds ${11 - cs} entropy bits and the ${cs} checksum bits. A random sequence of words passes the check with probability <span class="eq">2^−${cs} = 1/${2 ** cs}</span>, and for eleven fixed words exactly <span class="eq">2^${11 - cs}</span> of the 2048 last words are valid.`,
      'Flip one entropy bit (reveal mode) and usually two words change: the word containing the bit and, in 15 cases out of 16, the last word, whose checksum bits come from a hash. On average 1.886 words for 12-word phrases.',
      'PRACTICE: The 2026 Coldcard failure produced perfectly valid 24-word phrases from a timer-seeded generator: the encoding and the checksum were flawless, the entropy was not. This step cannot see the quality of its input — users who had mixed in 50 or more dice rolls were safe.',
    ],
  });
}

function seedCard(run, base) {
  const words = run.mnemonic.words.map((w, j) =>
    (base && base.words.length === run.mnemonic.words.length && base.words[j] !== w ? el('span', { class: 'chg', text: w }) : w));
  const spaced = words.flatMap((w, j) => (j ? [' ', w] : [w]));
  return stepCard({
    no: 2, id: 'step-2', title: 'Mnemonic → seed', cats: ['derivation'],
    formula: `seed = PBKDF2-HMAC-SHA512( password = NFKD(mnemonic), salt = NFKD("mnemonic" ‖ passphrase), ${PBKDF2_ITERATIONS} iterations, 64 bytes )`,
    body: [
      el('p', { class: 'tagline', text: 'password (the words, single spaces)' }),
      el('p', { class: 'hex words', style: 'margin:0 0 10px' }, spaced),
      facts([
        ['passphrase', run.passphrase ? `"${run.passphrase}"` : '(none)'],
        ['salt', `"mnemonic${run.passphrase}"`],
        ['measured time for 2048 HMAC rounds', `${run.seedMs.toFixed(1)} ms`],
      ]),
      el('div', { style: 'margin-top:12px' }, [hexValue('seed', bytesToHex(run.seed), { base: base?.seed })]),
    ],
    why: 'it adds the passphrase, and makes every guess cost 2048 HMAC computations instead of one.',
    notes: [
      'PBKDF2 hashes the password with HMAC-SHA512 2048 times in a chain. The output is 512 bits, but it carries no more entropy than the words did: a deterministic function cannot add unpredictability, <span class="eq">H(f(X)) ≤ H(X)</span>.',
      'The 2048 iterations multiply the cost of trying one candidate by 2048 = 2¹¹, i.e. add 11 bits of work. Irrelevant for 128 random bits, decisive for weak inputs: a forgotten word (2048 candidates) or a short passphrase.',
      'PBKDF2 does <strong>not</strong> check the checksum: any string gives a seed. Wallet software checks it; the mathematics does not.',
      'PRACTICE: The time above is your browser’s native Web Crypto. A GPU runs on the order of a million of these per second, which is why a passphrase must be long and random to add real protection.',
    ],
  });
}

function masterCard(run, base) {
  return stepCard({
    no: 3, id: 'step-3', title: 'Seed → master key and chain code', cats: ['derivation'],
    formula: 'I = HMAC-SHA512( key = "Bitcoin seed", data = seed ) &nbsp;→&nbsp; k<sub>m</sub> = I<sub>L</sub> (left 32 bytes), &nbsp;c<sub>m</sub> = I<sub>R</sub> (right 32 bytes)',
    body: [
      hexValue('master private key kₘ = I_L', keyHex(run.master.privateKey), { base: base?.master }),
      hexValue('master chain code cₘ = I_R', bytesToHex(run.master.chainCode), { base: base?.chain }),
    ],
    why: 'it cuts the seed into a key the curve can use and a chain code, the extra secret every child derivation is keyed with.',
    notes: [
      'HMAC is a keyed hash. Here the “key” is the constant string <span class="eq">"Bitcoin seed"</span>, used by Ethereum wallets too: it only separates this use of HMAC from any other. The left half must be a valid private key, <span class="eq">0 &lt; kₘ &lt; n</span>; otherwise the seed is rejected (probability about <span class="eq">2^−128</span>).',
      'The chain code is why a private key alone does not reveal its children: deriving them needs <span class="eq">c</span> as well. The pair (key, chain code) is the <em>extended key</em> that xprv and xpub serialise.',
    ],
  });
}

function pathCard(run, base) {
  const sameShape = base && base.levels.length === run.trace.length;
  const levels = run.trace.map((t, n) => {
    const b = sameShape ? base.levels[n] : null;
    const label = run.path.split('/')[n + 1];
    return el('div', { class: 'level' }, [
      el('p', { style: 'margin:0 0 8px', html: `<strong>level ${n + 1} · ${label}</strong> — ${BIP44_LEVELS[n] ?? 'level ' + (n + 1)} · ${t.hardened
        ? 'hardened: data = 0x00 ‖ k<sub>par</sub> ‖ ser32(i)'
        : 'normal: data = serP(k<sub>par</sub>·G) ‖ ser32(i)'}${t.skipped ? ` · ${t.skipped} invalid index skipped` : ''}` }),
      hexValue('HMAC data', bytesToHex(t.hmacData), { base: b?.data }),
      hexValue('I_L', bytesToHex(t.IL), { base: b?.IL }),
      hexValue('child key kᵢ = I_L + k_par mod n', keyHex(t.childKey), { base: b?.k }),
    ]);
  });
  return stepCard({
    no: 4, id: 'step-4', title: `Path walk: ${run.path}`, cats: ['derivation'],
    formula: 'I = HMAC-SHA512( key = c<sub>par</sub>, data ) &nbsp;→&nbsp; k<sub>i</sub> = (I<sub>L</sub> + k<sub>par</sub>) mod n, &nbsp;c<sub>i</sub> = I<sub>R</sub>',
    body: [
      ...levels,
      el('p', { class: 'small muted', html: `If <span class="eq">I_L ≥ n</span> or <span class="eq">kᵢ = 0</span> the index is skipped. Probability per derivation: <span class="eq">(2²⁵⁶ − n)/2²⁵⁶ ≈ ${INVALID_CHILD_PROBABILITY.toExponential(2)}</span> — never observed.` }),
    ],
    why: 'one backup must yield unlimited keys, and BIP-44 fixes which branch of the tree each coin and account uses so that different wallets find the same keys.',
    notes: [
      'A hardened step (<span class="eq">i’</span>, i.e. <span class="eq">i ≥ 2³¹</span>) puts the parent <em>private</em> key into the HMAC; a normal step puts only the parent <em>public</em> key. That one line decides whether children can be derived from public data.',
      'For a normal child, multiplying the formula by <span class="eq">G</span> gives <span class="eq">Kᵢ = I_L·G + K_par</span>: public children from a public parent — the watch-only wallet. The same linearity lets anyone holding the parent xpub and one child private key solve <span class="eq">k_par = kᵢ − I_L mod n</span>. Hardening the top three levels stops that leak from climbing to other accounts or coins.',
      'PRACTICE: Import the same words into MetaMask and Ledger Live and the second account differs: MetaMask increments the last level, Ledger Live the account level. Switch the path above to see both.',
    ],
  });
}

function pointCard(run, base) {
  const Q = run.account.Q;
  return stepCard({
    no: 5, id: 'step-5', title: 'Private key → public key', cats: ['publickey'],
    formula: 'Q = k·G on secp256k1: &nbsp;y² = x³ + 7 mod p, &nbsp;p = 2²⁵⁶ − 2³² − 977',
    body: [
      hexValue('private key k (from step 4)', keyHex(run.node.privateKey), { base: base?.k }),
      hexValue('x', ethereumHex(Q).slice(0, 64), { base: base?.x }),
      hexValue('y', ethereumHex(Q).slice(64), { base: base?.y }),
      hexValue('compressed 02/03 ‖ x (prefix = parity of y)', compressedHex(Q), { base: base?.compressed }),
      hexValue('uncompressed 04 ‖ x ‖ y', uncompressedHex(Q), { base: base?.uncompressed }),
    ],
    why: 'anyone can verify a signature against Q, but only the holder of k can produce one.',
    notes: [
      'This is hw01’s <span class="eq">Q = kG</span> at full size: about 256 doublings and 128 additions forward, while going back — the discrete logarithm — costs about <span class="eq">√n ≈ 2¹²⁸</span> operations with the best known generic attack.',
      'The point is stored as <span class="eq">x</span> and <span class="eq">y</span>, 32 bytes each. Since <span class="eq">y</span> is fixed by <span class="eq">x</span> up to its sign, the compressed form keeps <span class="eq">x</span> and one parity bit: BIP-32 hashes that 33-byte form.',
      'PRACTICE: This implementation is educational and not constant-time: its running time depends on the bits of <span class="eq">k</span>, which is exactly what side-channel attacks measure. Real wallets use libraries such as libsecp256k1.',
    ],
  });
}

function keccakCard(run, base) {
  return stepCard({
    no: 6, id: 'step-6', title: 'Public key → address', cats: ['hashing'],
    formula: 'address = last 20 bytes of Keccak-256( x ‖ y ) &nbsp;(64 bytes in, 32 out, 12 dropped)',
    body: [
      hexValue('input x ‖ y', ethereumHex(run.account.Q), { base: base ? base.x + base.y : null }),
      hexValue('Keccak-256(x ‖ y): the kept 20 bytes in colour', bytesToHex(run.account.keccak), { base: base?.keccak, mark: (i) => (i < 24 ? 'dim' : 'keep') }),
      hexValue('address', run.account.lower, { base: base ? base.keccak.slice(24) : null, prefix: '0x' }),
    ],
    why: 'it makes a short, uniform identifier and removes the algebra: the address reveals nothing about Q.',
    notes: [
      'Keccak-256 is the sponge that won the SHA-3 competition, with its original padding byte <span class="eq">0x01</span>. The standardised SHA3-256 (FIPS 202, 2015) uses <span class="eq">0x06</span>, so the two give unrelated outputs from the same permutation — Ethereum’s Keccak-256 is <strong>not</strong> SHA3-256.',
      'An address that has only received funds exposes only this hash. The first outgoing transaction publishes <span class="eq">Q</span> (nodes recover it from the signature), and from then on only the discrete logarithm protects the key.',
      'PRACTICE: 160 bits make a targeted preimage cost about 2¹⁶⁰, more than attacking the curve (2¹²⁸); but finding <em>any</em> two keys with the same address costs only about 2⁸⁰ by the birthday bound.',
    ],
  });
}

function eipCard(run, base) {
  const { table, checksummed, letters, hash } = run.checksum;
  const cells = table.map((t, i) => el('div', {
    class: [t.upper ? 'up' : '', t.letter ? '' : 'digit', base && base.eip[i] !== checksummed[i + 2] ? 'chg' : ''].join(' ').trim(),
    title: t.letter ? `nibble ${t.nibble} ${t.upper ? '≥ 8: uppercase' : '< 8: lowercase'}` : 'digit: no case, no check bit',
  }, [el('div', { class: 'c', text: checksummed[i + 2] }), el('div', { class: 'muted', text: t.nibble })]));

  return stepCard({
    no: 7, id: 'step-7', title: 'Address → EIP-55 checksummed address', cats: ['checksum'],
    formula: 'h = Keccak-256( ASCII of the lowercase hex address ); &nbsp;letter i uppercase ⇔ hex digit i of h ≥ 8',
    body: [
      hexValue('h = Keccak-256 of the 40-character text', hash),
      el('p', { class: 'tagline', text: 'each character, with the digit of h beneath it (uppercase letters framed)' }),
      el('div', { class: 'eip-grid', style: 'margin-bottom:12px' }, cells),
      hexValue('checksummed address', checksummed.slice(2), { base: base?.eip, prefix: '0x' }),
      facts([
        ['letters in this address = check bits L', String(letters)],
        ['a random typo passes with probability ≈ 2^−L', `${(100 * 2 ** -letters).toPrecision(2)} %`],
        ['average over all addresses, (13/16)⁴⁰', '0.0247 %'],
      ]),
    ],
    why: 'a mistyped address is detected without changing the format: old software still reads the same 40 characters.',
    notes: [
      'Hex parsers ignore case, so case is free room for redundancy. Each letter carries one check bit; digits carry none. An address has on average 15 letters, so 15 check bits; after a typo each is right with probability ½.',
      'The population average is <span class="eq">E[2^−L] = (10/16 + 6/16 · ½)⁴⁰ = (13/16)⁴⁰ ≈ 0.0247 %</span>, which is not <span class="eq">2^−15</span>: an average of exponentials is dominated by the letter-poor addresses (Jensen’s inequality).',
      'An all-lowercase or all-uppercase address is accepted as “no checksum”, so the check is optional; and it guards against accidents only — anyone can compute the correct casing of any address, including an attacker’s look-alike.',
    ],
  });
}

/* ---------- the page ---------- */

startPage({
  shell: hw02Shell('pipeline.html'),
  sticky: WALLET_KEYS,
  memory: WALLET_MEMORY,
  render: async ({ state, update }) => {
    const { wallet, run } = await loadWallet(state);
    const input = walletInput({ wallet, update, extras: [revealRow(state, update, wallet)] });
    if (!run) return [input];

    const values = snapshot(run);
    if (state.reveal !== '1') baseline = null;
    else baseline ??= values;
    const base = state.reveal === '1' && baseline !== values ? baseline : null;

    return [
      input,
      base ? el('p', { class: 'small muted', html: 'Reveal mode: every value is compared with the baseline taken when it was switched on. Changed characters are <span style="color:var(--diff)">red</span>, with the number of changed bits beside each value.' }) : null,
      entropyCard(run, base),
      seedCard(run, base),
      masterCard(run, base),
      pathCard(run, base),
      pointCard(run, base),
      keccakCard(run, base),
      eipCard(run, base),
      el('div', { class: 'card' }, [
        el('div', { class: 'result' }, [
          el('div', { class: 'label', text: 'the address' }),
          el('div', { class: 'value', text: run.checksum.checksummed }),
          el('div', { class: 'small muted', html: `at <span class="eq">${run.path}</span>` }),
        ]),
        explain([
          `That is the whole pipeline: ${fmt(wallet.bytes * 8)} random bits in, one address out, through seven deterministic steps. Change any input on the card at the top and every value from that step down changes — switch on reveal mode to see by how much.`,
        ]),
      ]),
    ];
  },
});
