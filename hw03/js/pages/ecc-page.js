/* ecc-page.js — the Toy ECC page: why EC-ElGamal (Caesar → naive M + Q →
   ElGamal), the roles of the keys, one encryption and decryption step by step,
   "encrypt again" to show randomisation, and the byte histogram of many
   ciphertexts. The maths is in ../core/elgamal.js. */

import { el, explain, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { barChart } from '../../../assets/js/ui/barchart.js';
import { chiSquare, shannonEntropy } from '../../../assets/js/core/stats.js';
import { compressedHex, G } from '../../../assets/js/core/secp256k1.js';
import { keygen, encrypt, decrypt, naiveEncrypt, naiveAttack, naiveAttackOnElGamal, ciphertextBytes, CHUNK } from '../core/elgamal.js';
import { shift } from '../core/caesar.js';
import { facts, tag } from './widgets.js';
import { BITS, clampBits, readKey } from './toykey.js';
import { hw03Shell, STICKY, MEMORY } from './shell.js';


const hex = (v) => v.toString(16);
const ptHex = (P) => compressedHex(P);
const shortHex = (h, n = 10) => (h.length > 2 * n + 1 ? `${h.slice(0, n)}…${h.slice(-6)}` : h);
const bytesHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ') || '(none)';


/** One labelled value: name, public/secret, the formula, the value (hex). */
const value = (name, kind, formula, text) => el('div', { class: `val ${kind}` }, [
  el('div', { class: 'val-head' }, [el('strong', { html: name }), tag(kind), formula ? el('span', { class: 'eq', html: formula }) : null]),
  el('div', { class: 'hex', text }),
]);


/* ---------- input card ---------- */

function inputCard({ msg, bits, d, Q }, update) {
  const msgIn = el('input', { id: 'in-msg', class: 'wide', value: msg, spellcheck: 'false', onkeydown: (e) => e.key === 'Enter' && apply() });
  const bitsIn = el('input', { id: 'in-bits', type: 'number', class: 'num', min: BITS.min, max: BITS.max, value: String(bits), onkeydown: (e) => e.key === 'Enter' && apply() });
  const readBits = () => clampBits(bitsIn.value);
  function apply() { update({ msg: msgIn.value, bits: readBits() }); }
  const newKey = () => { const b = readBits(); update({ msg: msgIn.value, bits: b, d: String(keygen(b).d) }); };

  return el('div', { class: 'card' }, [
    el('div', { class: 'row' }, [
      field('message (UTF-8)', msgIn),
      el('button', { class: 'primary', type: 'button', text: 'Encrypt', onclick: apply }),
      el('div', { class: 'vrule' }),
      field('key range: d ≤ 2^bits', bitsIn),
      el('button', { type: 'button', text: 'New key', onclick: newKey }),
    ]),
    el('p', { class: 'small muted', style: 'margin:10px 0 0', html:
      `The message is what gets encrypted on this page (and, later, by Caesar). ` +
      `The key range is the toy restriction: <span class="eq">d</span> is drawn with the CSPRNG from ` +
      `<span class="eq">[1, 2^${bits}]</span> instead of <span class="eq">[1, n − 1]</span>, n ≈ 2²⁵⁶.` }),
    facts([
      ['private key <span class="eq">d</span> (toy key, public by construction: it is in the URL)', String(d)],
      ['public key <span class="eq">Q = dG</span> (compressed)', shortHex(ptHex(Q), 14)],
    ]),
    explain([
      'Every value on this page is computed in your browser on the real secp256k1 curve; only the size of <span class="eq">d</span> is toy. A 20-bit key means about a million candidates — the attack page will search them.',
      'Each “Encrypt” draws fresh nonces <span class="eq">k</span>, so the ciphertexts change even when the message and the key do not.',
    ], 'What does each value change?'),
  ]);
}

/* ---------- 1. the progression ---------- */

function progressionPanel({ msg, Q }, ct) {
  const caesar = shift(msg, 3);
  const naive = naiveEncrypt(Q, msg);
  const stolen = naiveAttack(Q, naive);
  const garbage = naiveAttackOnElGamal(Q, ct[0]);

  const step = (no, title, formula, chips, body, fixes) => el('div', { class: 'prog-step' }, [
    el('div', { class: 'prog-head' }, [el('span', { class: 'step-no', text: no }), el('h3', { text: title })]),
    el('p', { class: 'formula', html: formula }),
    el('p', { class: 'chips' }, chips.map(([cls, text]) => el('span', { class: `chip ${cls}`, text }))),
    ...body,
    fixes ? el('p', { class: 'fixes', html: fixes }) : null,
  ]);

  return el('div', { class: 'card' }, [
    el('h2', { text: 'From Caesar to ElGamal in three steps' }),
    el('p', { class: 'small muted', text: 'All three add a mask in a group. What changes is who can compute the mask, and whether it is reused.' }),
    el('div', { class: 'prog' }, [
      step(1, 'Caesar', 'c<sub>i</sub> = m<sub>i</sub> + k &nbsp;in (ℤ₂₆, +)',
        [['bad', 'fixed'], ['ok', 'secret'], ['bad', '26 values']],
        [
          facts([['message', msg], ['ciphertext, k = 3', caesar]]),
          el('p', { class: 'attacker warn', html: '<strong>Attacker:</strong> the same k on every letter, so letter frequencies survive, and only 26 keys to try. The hard part is only to recognise English automatically.' }),
        ], null),
      step(2, 'Naive M + Q', 'C = M + Q &nbsp;in E(𝔽ₚ), ≈ 2²⁵⁶ points',
        [['bad', 'fixed'], ['bad', 'public'], ['ok', '≈ 2²⁵⁶ values']],
        [
          value('C', 'public', '= M + Q', shortHex(ptHex(naive[0].C), 16)),
          el('p', { class: 'attacker warn', html: `<strong>Attacker</strong>, with public data only: C − Q = M → <strong>“${escapeHtml(stolen)}”</strong>. The group is huge, but the mask is public.` }),
        ], '<strong>Fixes:</strong> the tiny secret — the mask now lives in a group of about 2²⁵⁶ elements. <strong>Breaks:</strong> everyone can subtract it.'),
      step(3, 'EC-ElGamal', 'C₁ = kG, &nbsp;C₂ = M + kQ',
        [['ok', 'fresh'], ['ok', 'secret'], ['ok', '≈ 2²⁵⁶ values']],
        [
          value('C₁', 'public', '= kG', shortHex(ptHex(ct[0].C1), 16)),
          value('C₂', 'public', '= M + S', shortHex(ptHex(ct[0].C2), 16)),
          el('p', { class: 'attacker ok-box', html: '<strong>Attacker:</strong> needs S = kQ. Knows Q and C₁ = kG but neither k nor d — computing kQ from them is the Diffie–Hellman problem. ' +
            `The old trick gives C₂ − Q = ${shortHex(ptHex(garbage), 8)}…, which is not the message.` }),
        ], '<strong>Fixes:</strong> the mask is secret (only k or d computes it) and fresh (a new k every time). <strong>Left:</strong> the toy’s small d — the attack page.'),
    ]),
    explain([
      'Caesar and textbook ElGamal are the same construction, <span class="eq">ciphertext = message + mask</span> in a finite abelian group. Caesar uses one secret mask for every letter in a group of 26 elements. Step 2 moves to the curve group but uses the public key as the mask, which shows that a big group alone buys nothing.',
      'ElGamal makes the mask secret and fresh with Diffie–Hellman: <span class="eq">S = kQ = k(dG) = d(kG) = dC₁</span>. The sender knows k, the receiver knows d, and both reach S without exchanging a secret; an eavesdropper sees only Q and C₁.',
      'The assignment’s Part 1 defined only key generation (d, Q = dG); a curve alone does not encrypt. EC-ElGamal is the standard public-key encryption on that same group, and its textbook form keeps the comparison with Caesar exact.',
      'PRACTICE: Deployed systems use the hybrid form — ECIES, HPKE (RFC 9180), age, Signal’s X3DH: ECDH gives S, a KDF turns its x-coordinate into a symmetric key, and an AEAD such as AES-GCM encrypts the data. Textbook ElGamal is malleable: (C₁, C₂ + T) decrypts to M + T.',
    ]),
  ]);
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 2. the keys ---------- */

function keysPanel({ d, Q, bits }, ct) {
  const c = ct[0];
  const row = (sym, name, kind, who, val, role) => el('tr', {}, [
    el('td', { class: 'left', html: `<span class="eq">${sym}</span>` }),
    el('td', { class: 'left', text: name }),
    el('td', { class: 'left' }, [tag(kind)]),
    el('td', { class: 'left', text: who }),
    el('td', { class: 'left mono', text: val }),
    el('td', { class: 'left', html: role }),
  ]);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The keys and who holds them' }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data roles prose' }, [
      el('thead', {}, [el('tr', {}, ['symbol', 'name', '', 'who knows it', 'value', 'role'].map((h) => el('th', { class: 'left', text: h })))]),
      el('tbody', {}, [
        row('G', 'generator', 'public', 'everyone', shortHex(ptHex(G)), 'fixed by the SEC 2 standard; order n ≈ 2²⁵⁶, cofactor 1'),
        row('d', 'private key', 'secret', 'receiver only', String(d), `decrypts. Toy: d ∈ [1, 2^${bits}], not [1, n − 1]`),
        row('Q = dG', 'public key', 'public', 'everyone', shortHex(ptHex(Q)), 'lets anyone encrypt to the receiver'),
        row('k', 'nonce (ephemeral key)', 'secret', 'sender, then destroyed', shortHex(hex(c.k)), 'fresh and uniform in [1, n − 1] for every chunk; whoever has k computes S without d'),
        row('S = kQ = dC₁', 'shared secret', 'secret', 'sender and receiver', shortHex(ptHex(c.S)), 'the one-time mask added to M'),
        row('(C₁, C₂)', 'ciphertext', 'public', 'everyone', `${shortHex(ptHex(c.C1), 6)}, ${shortHex(ptHex(c.C2), 6)}`, 'what travels over the network'),
      ]),
    ])]),
    el('p', { class: 'formula', style: 'margin-top:14px', html: 'S = kQ = k(dG) = (kd)G = d(kG) = dC₁ &nbsp;— Diffie–Hellman: the sender uses k, the receiver uses d' }),
    explain([
      'The private key decrypts, the public key encrypts, and the nonce randomises. The receiver publishes Q once; any number of senders can then encrypt to it without ever sharing a secret with the receiver.',
      'k is a per-message private key. If it leaks, that message is open (S = kQ); if it is reused, the difference of two ciphertexts C₂ − C₂′ = M − M′ leaks, and one known plaintext gives S and opens every other message encrypted with the same k.',
      'PRACTICE: Nonce failures are how elliptic-curve keys are lost in practice — the 2010 PS3 signing key and the 2013 Android Bitcoin wallets both came from ECDSA nonces that were not fresh and uniform.',
    ]),
  ]);
}

/* ---------- 3. encryption, step by step ---------- */

function encryptPanel({ msg }, ct) {
  const shown = ct.slice(0, 3);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Encryption, step by step' }),
    el('p', { class: 'formula', html: 'Enc(Q, M): &nbsp;k ← [1, n − 1], &nbsp;C₁ = kG, &nbsp;S = kQ, &nbsp;C₂ = M + S, &nbsp;output (C₁, C₂)' }),
    el('p', { class: 'small muted', text: `“${msg}” is ${new TextEncoder().encode(msg).length} bytes of UTF-8, cut into ${ct.length} chunk${ct.length > 1 ? 's' : ''} of at most ${CHUNK} bytes; each chunk is one point and gets its own k.` }),
    ...shown.map((c, i) => el('div', { class: 'chunk' }, [
      ct.length > 1 ? el('h3', { text: `chunk ${i + 1} of ${ct.length}` }) : null,
      el('ol', { class: 'steps' }, [
        el('li', {}, [el('span', { class: 'what', html: '<strong>bytes → integer</strong> m = int(01 ‖ bytes); the 01 sentinel keeps leading zero bytes' }), el('div', { class: 'hex', text: `bytes ${bytesHex(c.bytes)}\nm = 0x${hex(c.m)}` })]),
        el('li', {}, [el('span', { class: 'what', html: `<strong>integer → point</strong> (Koblitz): x = 256·m + j, try j = 0, 1, … until x³ + 7 is a square mod p; here j = ${c.j}, ${c.j + 1} tr${c.j ? 'ies' : 'y'}` }), value('M', 'secret', '= (x, √(x³ + 7))', ptHex(c.M))]),
        el('li', {}, [el('span', { class: 'what', html: '<strong>fresh nonce</strong> from crypto.getRandomValues' }), value('k', 'secret', '← [1, n − 1]', hex(c.k).padStart(64, '0'))]),
        el('li', {}, [el('span', { class: 'what', html: '<strong>first half</strong> of the ciphertext' }), value('C₁', 'public', '= kG', ptHex(c.C1))]),
        el('li', {}, [el('span', { class: 'what', html: '<strong>the mask</strong>: Diffie–Hellman with the receiver’s Q' }), value('S', 'secret', '= kQ', ptHex(c.S))]),
        el('li', {}, [el('span', { class: 'what', html: '<strong>second half</strong>: add the mask in the group' }), value('C₂', 'public', '= M + S', ptHex(c.C2))]),
      ]),
    ])),
    ct.length > shown.length ? el('p', { class: 'small muted', text: `… and ${ct.length - shown.length} more chunk(s), each the same way with its own k.` }) : null,
    facts([
      ['plaintext', `${new TextEncoder().encode(msg).length} bytes`],
      ['ciphertext, compressed points', `${ct.length} × (33 + 33) = ${ct.length * 66} bytes`],
    ]),
    explain([
      'Textbook ElGamal encrypts a <em>point</em>, so the message is first encoded as one. Koblitz’s method appends a byte j to the message integer and tries values until x³ + 7 has a square root mod p; about half of all x work, so the number of tries is Geometric(½) with mean 2. Because p ≡ 3 (mod 4), the root is simply (x³ + 7)^((p+1)/4).',
      'M is marked secret because it <em>is</em> the message, in another form. Everything marked public can be sent; k must be thrown away after this step.',
      'The ciphertext is larger than the message: one point in, two points out. Hybrid schemes avoid that by sending one point plus a symmetric ciphertext of the message’s own length.',
    ]),
  ]);
}

/* ---------- 4. decryption ---------- */

function decryptPanel({ d }, ct) {
  let dec;
  try { dec = decrypt(d, ct); } catch (e) { return el('div', { class: 'card' }, [el('h2', { text: 'Decryption' }), el('p', { class: 'err', text: e.message })]); }
  const c = ct[0], s = dec.steps[0];
  const same = s.S.eq(c.S), back = s.M.eq(c.M);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Decryption' }),
    el('p', { class: 'formula', html: 'Dec(d, (C₁, C₂)): &nbsp;check C₁, &nbsp;S′ = dC₁, &nbsp;M = C₂ − S′, &nbsp;decode M' }),
    el('ol', { class: 'steps' }, [
      el('li', {}, [el('span', { class: 'what', html: '<strong>validate</strong> C₁ and C₂: on y² = x³ + 7, coordinates below p, not 𝒪' }), el('p', { class: 'ok', text: '✔ both are points of secp256k1' })]),
      el('li', {}, [el('span', { class: 'what', html: '<strong>rebuild the mask</strong> with the private key' }), value('S′', 'secret', '= dC₁', ptHex(s.S)),
        el('p', { class: same ? 'ok match' : 'err', text: same ? '✔ S′ = S: the receiver reached the sender’s mask without ever seeing k' : '✘ S′ ≠ S' })]),
      el('li', {}, [el('span', { class: 'what', html: '<strong>remove the mask</strong>' }), value('M', 'secret', '= C₂ − S′', ptHex(s.M)),
        el('p', { class: back ? 'ok' : 'err', text: back ? '✔ the encoded message point' : '✘ wrong point' })]),
      el('li', {}, [el('span', { class: 'what', html: '<strong>decode</strong>: m = ⌊x / 256⌋, drop the sentinel, UTF-8' })]),
    ]),
    el('div', { class: 'result' }, [el('div', { class: 'label', text: 'recovered message' }), el('div', { class: 'value', text: dec.text || '(empty)' })]),
    explain([
      'Correctness is one line of algebra: C₂ − dC₁ = M + kdG − dkG = M. The receiver never learns k; the private key d is enough to rebuild the same mask.',
      'The validation step is not decoration. A decryptor that multiplies whatever C₁ it receives by d can be fed a point of a different, weak curve and leak d modulo small primes (an invalid-curve attack).',
    ]),
  ]);
}

/* ---------- 5. encrypt again ---------- */

function againPanel({ msg, d, Q }, first) {
  const rows = [first];
  const body = el('tbody');
  const draw = () => body.replaceChildren(...rows.map((ct, i) => el('tr', { class: i === 0 ? 'is-current' : null }, [
    el('td', { text: String(rows.length - i) }),
    el('td', { class: 'left mono', text: shortHex(hex(ct[0].k).padStart(64, '0'), 6) }),
    el('td', { class: 'left mono', text: shortHex(ptHex(ct[0].C1), 8) }),
    el('td', { class: 'left mono', text: shortHex(ptHex(ct[0].C2), 8) }),
    el('td', { class: 'left', text: decrypt(d, ct).text }),
  ])));
  const again = () => { rows.unshift(encrypt(Q, msg)); rows.length = Math.min(rows.length, 6); draw(); };
  draw();
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Encrypt again' }),
    el('div', { class: 'row', style: 'margin-bottom:10px' }, [el('button', { type: 'button', class: 'primary', text: 'Encrypt again', onclick: again })]),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: '#' }), el('th', { class: 'left', text: 'k (secret)' }), el('th', { class: 'left', text: 'C₁' }), el('th', { class: 'left', text: 'C₂' }), el('th', { class: 'left', text: 'decrypts to' })])]),
      body,
    ])]),
    el('p', { class: 'small muted', style: 'margin-top:8px', text: 'Same message, same key, a different ciphertext every time — and every one decrypts correctly. (First chunk shown; newest on top.)' }),
    explain([
      'Public-key encryption has to be randomised. Anyone can encrypt with Q, so if encryption were deterministic an attacker could encrypt a guess (“ATTACK AT DAWN”? “RETREAT”?) and compare it with the intercepted ciphertext. Fresh k defeats that: this is what the IND-CPA security notion demands, and ElGamal meets it under the DDH assumption.',
      'Caesar is the opposite: the same letter always becomes the same letter, so equal words give equal ciphertexts.',
    ]),
  ]);
}

/* ---------- 6. byte histogram ---------- */

const RUNS = 200;

function histogramPanel({ msg, Q }) {
  const out = el('div', {}, [el('p', { class: 'small muted', text: `Encrypting “${msg}” ${RUNS} times…` })]);
  const counts = new Array(256).fill(0);
  let done = 0, total = 0;
  // in batches, so the page paints first and stays responsive (≈ 2 ms per chunk)
  const batch = () => {
    for (let i = 0; i < 10 && done < RUNS; i++, done++) for (const b of ciphertextBytes(encrypt(Q, msg))) { counts[b]++; total++; }
    if (done < RUNS) { out.firstChild.textContent = `Encrypting “${msg}” ${RUNS} times… ${done}/${RUNS}`; setTimeout(batch, 0); return; }
    const expected = total / 256;
    const chi = chiSquare(counts);
    const H = shannonEntropy(counts.map((c) => c / total));
    out.replaceChildren(
      barChart({
        categories: counts.map((_, i) => i), series: [{ label: 'observed count', color: 'var(--s1)', values: counts }],
        refLines: [{ y: expected, label: `uniform: ${expected.toFixed(0)}` }], xTitle: 'byte value', yTitle: 'count', height: 220,
      }),
      facts([
        ['bytes observed (x‖y of C₁ and C₂, no prefix byte)', `${total}`],
        ['entropy of the byte histogram', `${H.toFixed(4)} bits/byte (max 8)`],
        ['χ² against uniform', `${chi.stat.toFixed(1)}, df = ${chi.df}, p = ${chi.p.toFixed(3)}`],
      ]),
      el('p', { class: 'small muted', style: 'margin-top:8px', text: chi.p > 0.01
        ? 'No detectable departure from uniform: the ciphertext bytes carry no trace of the message’s letters.'
        : 'p < 0.01 on this run; with 256 bins that happens about once in a hundred runs by chance — press Encrypt to redraw.' }),
    );
  };
  setTimeout(batch, 0);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'What the ciphertext looks like statistically' }),
    out,
    explain([
      `The same short message is encrypted ${RUNS} times and every byte of every ciphertext coordinate is counted. If the mask S = kQ behaves like a uniform random point, C₂ = M + S is a one-time pad in the group and the bytes are flat: about 8 bits per byte, and a χ² test that finds nothing.`,
      'The entropy estimate sits slightly below 8 even for perfectly uniform bytes: with this many samples the plug-in estimator is biased down by about 255 / (2·N·ln 2) ≈ 0.007 bits.',
      'The SEC encodings’ prefix byte (02, 03 or 04) is left out on purpose: it takes only one to three values and would show up as a spike that says nothing about the message.',
      'This is the baseline for the Caesar page, where the ciphertext histogram is the plaintext’s letter histogram, shifted.',
    ]),
  ]);
}

/* ---------- the page ---------- */

startPage({
  shell: hw03Shell('ecc.html'),
  sticky: STICKY,
  memory: MEMORY,
  render: ({ state, update, patch }) => {
    const s = readKey(state, patch);
    const ct = encrypt(s.Q, s.msg);
    return [
      inputCard(s, update),
      progressionPanel(s, ct),
      keysPanel(s, ct),
      encryptPanel(s, ct),
      decryptPanel(s, ct),
      againPanel(s, ct),
      histogramPanel(s),
    ];
  },
});
