/* structure-page.js — Structure & AI (spec §6.8, note 06). Is ECDSA, built on
   algebraic structure, more at risk from a much stronger mathematician than a
   hash-based scheme? First the argument, every claim labelled with its
   evidence; then the experiments: S7 the period Shor exploits, S8 the
   homomorphism test, S9 linearity as a liability (ECDSA nonce reuse), S10 the
   fragility of hash-based signatures, S11 smooth numbers and index calculus. */

import { el, fmt } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { heatmap } from '../../../assets/js/ui/heatmap.js';
import { wilson, dickmanRho, ruleOfThree } from '../../../assets/js/core/stats.js';
import { bytesToHex, bigIntToBytes } from '../core/bytes.js';
import { N, publicKey, compressedHex } from '../core/secp256k1.js';
import { messageHash, sign, verify, recoverFromReusedNonce, recoverFromRelatedNonces } from '../core/ecdsa.js';
import { TOY_CURVES, ANOMALOUS } from '../core/toycurves.js';
import { levelSet, spectrum, peaks } from '../core/lab/s7.js';
import { stepCard, evidence, hexValue, facts } from './widgets.js';
import { labPanel, MEASURED, THEORY, pct, table, chart, verdict, section } from './lab-panel.js';
import { hw02Shell } from './shell.js';

const hex = (k) => bytesToHex(bigIntToBytes(k));

/* ---------- the argument ---------- */

function argumentPanel() {
  const claims = [
    ['theorem', 'Without extra structure, √n is optimal', 'In the generic group model (Shoup, 1997) an algorithm that only uses group operations needs about <span class="eq">√q</span> steps, <span class="eq">q</span> the largest prime factor of the group order. Anything faster must exploit how the elements are written down — extra structure. For secp256k1 none is known: <span class="eq">√n ≈ 2¹²⁸</span>.'],
    ['theorem', 'Signatures need only a one-way function', 'Rompel (1990): signatures exist as soon as one-way functions do, and hash-based signatures realise this almost literally (S10). For <em>signing</em> — Ethereum’s only public-key operation — structure is not necessary in principle.'],
    ['theorem', 'Key agreement needs more than a hash', 'Impagliazzo and Rudich (1989): key agreement cannot be built from a one-way permutation used as a black box. Barak and Mahmoody (2009): with only a random oracle, Merkle’s puzzles and their quadratic gap are optimal. Some structure is the price of public-key functionality — you cannot “hash everything”.'],
    ['theorem', 'Shor finds periods; Grover only searches', 'A quantum computer finds the hidden period of a group homomorphism in polynomial time (Shor): RSA, Diffie–Hellman and elliptic curves all fall. Against unstructured search it gains only a square root (Grover): hashes survive with doubled sizes. S7 shows the period Shor looks for.'],
    ['record', 'Structured schemes fail suddenly; hashes degrade gradually', null],
    ['measurement', 'In this very wallet, linearity is a liability twice', 'The xpub + child-key leak (<a href="bip32.html">BIP-32 lab</a>) and ECDSA nonce reuse (S9) exist only because the relations are linear: <span class="eq">k_par = kᵢ − I_L</span> and <span class="eq">s·k = z + r·d</span>.'],
    ['measurement', 'Hash-based signatures have their own fragility', 'Not algebra but <em>state</em>: a Lamport key used twice is weakened, used eight times is mostly forgeable (S10). And size: 8–50 KB per signature against 64 bytes for ECDSA, on a chain where every byte costs fees.'],
  ];
  const history = table(['scheme or problem', 'structure exploited', 'year', 'effect'], [
    ['Merkle–Hellman knapsack', 'the hidden super-increasing sequence', '1982', 'broken in polynomial time (Shamir)'],
    ['factoring / RSA', 'smoothness of integers (sieves)', '1980s–90s', 'sub-exponential: why RSA needs 3072 bits (S11)'],
    ['DLP in small-characteristic fields', 'subfield structure', '2013–14', 'quasi-polynomial (Joux; Barbulescu et al.)'],
    ['pairing-friendly BN curves', 'extension-field structure (exTNFS)', '2016', '≈ 128 → ≈ 100 bits; parameters revised'],
    ['Rainbow (NIST finalist)', 'multivariate structure', '2022', '“a weekend on a laptop” (Beullens)'],
    ['SIKE (NIST candidate)', 'auxiliary torsion-point information', '2022', 'key in ≈ 1 hour on one core (Castryck–Decru)'],
    ['ECDLP on prime-field curves', '—', '1985–2026', 'nothing better than generic √n, except special weak curves'],
    ['MD5 · SHA-1 (hashes)', 'differential trails', '2004 · 2017', 'collisions practical; preimages essentially intact'],
    ['SHA-2 · SHA-3 (hashes)', '—', '2001 · 2015', 'intact'],
  ]);
  return stepCard({
    title: 'The argument', cats: ['publickey', 'hashing'],
    body: [
      el('p', { html: '<strong>The question.</strong> “Structure creates attack surface; hashes minimise assumptions.” Against a much stronger mathematician — human or AI — is ECDSA, built on the algebra of an elliptic curve, more at risk than a hash-based scheme? Each claim below says how strong its evidence is.' }),
      el('ul', { class: 'claims' }, claims.map(([kind, title, text]) => el('li', {}, [
        el('div', { class: 'claim-head' }, [evidence(kind), el('strong', { text: title })]),
        text ? el('div', { class: 'small', html: text }) : history,
      ]))),
      el('div', { class: 'answer', style: 'margin-top:14px' }, [
        el('div', { class: 'label' }, ['A position, with its evidence  ', evidence('opinion')]),
        el('ol', { style: 'margin:4px 0 0', class: 'small' }, [
          el('li', { text: 'For signatures, hash-based schemes rest on fewer and weaker assumptions — a theorem-backed statement.' }),
          el('li', { text: 'ECDSA’s structure is a larger mathematical attack surface: proven fatal against a quantum computer, historically plausible against a new classical idea, yet unexploited classically for 40 years.' }),
          el('li', { text: 'The price of hashes is size and, for stateful schemes, fragile key management; the price of structure is concentrated mathematical risk.' }),
          el('li', { text: 'So a robust system exposes as little structure as possible — hash-hidden public keys, hardened derivation, deterministic nonces — and keeps a path to conservative primitives.' }),
          el('li', { text: 'Measured by actual losses, the dominant risk today is not mathematics at all (Incidents page). An AI that reads code at scale would find those bugs long before it proved a new theorem.' }),
        ]),
      ]),
    ],
    why: 'the homework asks for a position supported by evidence; this is the position, and the experiments below are the evidence.',
    notes: [
      'The distinction that matters is between <em>global</em> algebraic structure exposed by the interface (elliptic curves, RSA, lattices) and <em>local</em> structure hidden behind many rounds (hashes). “Hashes have no structure” is false; “hashes expose no usable global structure” is the accurate claim.',
      'Ethereum researchers are developing hash-based (XMSS-style) signatures for the consensus layer, precisely because hashes are among the most conservative post-quantum options — check the project’s current status before quoting it.',
    ],
  });
}

/* ---------- S7 · Shor in miniature ---------- */

const spectra = new Map();     // "C5 100" -> {curve: {set, mag, peaks}, hash: {...}}
function spectraFor(id, k) {
  const key = `${id} ${k}`;
  if (!spectra.has(key)) {
    const c = { ...TOY_CURVES[id], k };
    const make = (mode) => { const set = levelSet(c, mode); const mag = spectrum(set, c.n); return { set, mag, peaks: peaks(mag, c.n) }; };
    spectra.set(key, { curve: make('curve'), hash: make('hash') });
  }
  return spectra.get(key);
}

function s7(params, update, state) {
  const c = TOY_CURVES[params.curve], n = c.n;
  return labPanel({
    exp: 's7', id: 'S7', title: 'S7 · Shor in miniature', cats: ['publickey', 'hashing'],
    question: 'What exactly does a quantum computer exploit in elliptic-curve keys — and why does a hash give it nothing to hold on to?',
    steps: [
      `On a toy curve with n = ${n} points, choose a secret k and publish Q = kP.`,
      'Build the function f(a, b) = aP + bQ for every pair (a, b), and mark the pairs where it hits one fixed point. Because aP + bQ = (a + kb)P, those pairs lie on a line: a + k·b ≡ 1.',
      'Take the 2-D Fourier transform of the marked set. A line in (a, b) becomes a line of peaks v ≡ k·u in the spectrum — and any single peak reveals k = v·u⁻¹ mod n.',
      'Do the same with a hash, f(a, b) = SHA-256(a, b) mod n: the marked pairs are scattered, the spectrum is noise.',
    ],
    fields: [
      { key: 'curve', label: 'toy curve', options: Object.entries(TOY_CURVES).map(([id, x]) => [id, x.label]), hint: 'C0 is small enough to read every cell; C5 has 139² = 19 321 frequencies.' },
      { key: 'k', label: 'secret k', min: 1, max: n - 1, hint: `the private key, 1 … ${n - 1}. Change it and watch the line of peaks turn.` },
    ],
    params, update,
    compute: () => spectraFor(params.curve, params.k),
    view: ({ curve, hash }) => {
      const pick = state.pu !== undefined ? { u: Number(state.pu) % n, v: Number(state.pv) % n } : null;
      const hashKs = new Set(hash.peaks.map((p) => p.k));
      const map = (spec, label) => el('div', {}, [
        el('h3', { text: label }),
        heatmap({
          values: spec.mag, n, mark: pick,
          tip: (u, v, m) => `(u, v) = (${u}, ${v})\n|F| = ${m.toFixed(2)}`,
          onPick: (u, v) => update({ pu: String(u), pv: String(v) }),
        }),
      ]);
      let reading = el('p', { class: 'caption', text: 'Click a bright cell in either spectrum to read k from it.' });
      if (pick) {
        const inv = [...Array(n).keys()].find((x) => (pick.u * x) % n === 1);
        const onCurve = curve.mag[pick.u * n + pick.v], onHash = hash.mag[pick.u * n + pick.v];
        reading = facts([
          ['picked frequency (u, v)', `(${pick.u}, ${pick.v})`],
          ['|F| in the curve’s spectrum / the hash’s', `${onCurve.toFixed(2)} / ${onHash.toFixed(2)}`],
          pick.u === 0 ? ['u = 0', 'no inverse: pick a cell off the first row'] : [`u⁻¹ mod ${n}`, String(inv)],
          pick.u === 0 ? null : ['k = v·u⁻¹ mod n', `${pick.v} × ${inv} mod ${n} = ${(pick.v * inv) % n}${onCurve > 0.5 ? ((pick.v * inv) % n === params.k ? '  ✓ the secret' : '') : '  (no peak here in the curve’s spectrum)'}`],
        ]);
      }
      return {
        answer: { text: `All <strong>${curve.peaks.length}</strong> peaks of the curve’s spectrum lie on the line v ≡ ${params.k}·u, and every one gives <strong>k = ${params.k}</strong>. The hash’s spectrum has no line: its brightest cells point to ${hashKs.size} different values of “k”.` },
        body: [
          ...section(1, 'The two spectra', 'Each square is a frequency (u, v): row u, column v; brighter means a larger |F(u, v)|. Hover for the value, click to read k.'),
          el('div', { class: 'spectra' }, [map(curve, 'f(a, b) = aP + bQ — the curve'), map(hash, 'f(a, b) = SHA-256(a, b) mod n — a hash')]),
          ...section(2, 'Reading k from a peak'),
          reading,
          ...section(3, 'All the peaks of the curve', `The ${curve.peaks.length} non-zero frequencies off the origin, and the k each gives.`),
          table(['u', 'v', 'k = v·u⁻¹ mod n', '|F|'], curve.peaks.slice(0, 12).map((p) => [String(p.u), String(p.v), String(p.k), p.mag.toFixed(2)])),
          curve.peaks.length > 12 ? el('p', { class: 'caption', text: `… and ${curve.peaks.length - 12} more, all with the same k.` }) : null,
        ],
        rows: curve.peaks.map((p) => ({ u: p.u, v: p.v, k: p.k, magnitude: p.mag })),
      };
    },
    why: 'the period of k ↦ kP is the structure a quantum computer exploits; a hash has no period to find.',
    notes: [
      'This classical computation costs about n² evaluations of f — more than simply trying every k. It illustrates the <em>principle</em>, not a speed-up. Shor’s algorithm prepares a superposition over all (a, b) and performs the Fourier transform with O(log² n) quantum gates, so it reads a peak in polynomial time even for n ≈ 2²⁵⁶.',
      `A weak curve worth one sentence: y² = x³ + 7 over F₁₂₇ — secp256k1’s equation — has exactly ${ANOMALOUS.order()} points, as many as the field. Such “anomalous” curves fall to Smart’s attack (1999) even without a quantum computer. The equation is not what makes secp256k1 safe; its size and its point count are.`,
    ],
  });
}

/* ---------- S8 · structure test ---------- */

function s8(params, update) {
  return labPanel({
    exp: 's8', id: 'S8', title: 'S8 · The structure test', cats: ['publickey', 'hashing'],
    question: 'Does f(a + b) = f(a) + f(b) hold — for the curve, and for a hash?',
    steps: [
      'Draw random numbers a and b.',
      'For the curve, f(k) = kG: compare (a + b)G with aG + bG.',
      'For a hash, f(k) = Keccak-256(k) truncated to the same range: compare f(a + b) with f(a) + f(b).',
      'Count how often the equality holds, on secp256k1 and on the toy curve C5 (n = 139), where a chance coincidence has probability 1/139.',
    ],
    fields: [
      { key: 'n', label: 'pairs N', min: 10, max: 20000, hint: 'random pairs (a, b) tested on each of the four functions.' },
      { key: 'seed', label: 'seed', min: 0, max: 4294967295 },
    ],
    params, update,
    view: ({ counts, n, small }) => {
      const rows = [
        ['secp256k1', 'kG', counts.ecBig, 1, 'always (a homomorphism)'],
        ['secp256k1', 'Keccak-256 mod n', counts.hashBig, 0, '1/n ≈ 2⁻²⁵⁶: never'],
        [`C5 (n = ${small})`, 'kP', counts.ecToy, 1, 'always'],
        [`C5 (n = ${small})`, 'Keccak-256 mod n', counts.hashToy, 1 / small, `1/${small} = ${pct(1 / small)}`],
      ];
      return {
        answer: { text: `The curve satisfies the equation <strong>${counts.ecBig} times out of ${n}</strong> — always. The hash never does on secp256k1, and on the toy curve only by accident (${counts.hashToy} of ${n}, theory 1 in ${small}).` },
        body: [
          ...section(1, 'How often f(a + b) = f(a) + f(b)', 'The theory column is what a homomorphism (always) or a structureless function (by chance, 1/n) would give; the interval checks it.'),
          table(['group', 'f', 'holds', 'rate', 'Wilson 95 %', 'theory', ''], rows.map(([g, f, k, th, note]) => {
            const [lo, hi] = wilson(k, n);
            return [g, f, `${fmt(k)} / ${fmt(n)}`, pct(k / n), `[${pct(lo)}, ${pct(hi)}]`, note, verdict(lo <= th && th <= hi || (k === 0 && th < ruleOfThree(n)), 'agrees', 'check')];
          })),
        ],
        rows: rows.map(([group, f, holds, theory]) => ({ group, f, holds, n, theory })),
      };
    },
    why: 'the same equation is a feature (verification, xpubs) and a weakness (S9, the xpub leak, Shor) — and a hash simply does not satisfy it.',
    notes: [
      'This is HMWK 1’s experiment E5 at full size. Scalar multiplication is a group homomorphism from the integers mod n to the curve; that single fact lets verifiers check signatures, lets xpubs derive public children, and gives an attacker linear equations to solve.',
    ],
  });
}

/* ---------- S9 · nonce reuse ---------- */

/** The public test key at m/44'/60'/0'/0/0 (abandon … about) — see the pipeline explorer. */
const TEST_KEY = 0x1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727n;
const TEST_PUB = publicKey(TEST_KEY);

function s9(params, update) {
  return labPanel({
    exp: 's9', id: 'S9', title: 'S9 · Linearity as a liability: ECDSA nonce reuse', cats: ['publickey'],
    question: 'What happens if two ECDSA signatures share the same nonce?',
    steps: [
      'Sign two different messages with the public test key, using the same nonce k for both. Each signature is s = k⁻¹(z + r·d): one linear equation in the secret d.',
      'Same nonce ⇒ same r. Subtract the two equations: d disappears and k = (z₁ − z₂) / (s₁ − s₂).',
      'Put k back into either equation: d = (s₁·k − z₁) / r. Check it against the public key.',
      'Repeat with related nonces k and k + 1: r differs, but two linear equations in two unknowns still give d.',
    ],
    fields: [
      { key: 'msg1', label: 'message 1', type: 'text', hint: 'any text; its Keccak-256 hash is the number z₁ that gets signed.' },
      { key: 'msg2', label: 'message 2', type: 'text', hint: 'a different text.' },
      { key: 'nonce', label: 'nonce k (decimal or 0x…)', type: 'text', hint: 'the number every signature needs to be fresh and secret. Here it is chosen by hand — exactly the mistake.' },
    ],
    params, update,
    compute: () => {
      let k;
      try { k = BigInt(params.nonce.trim()); } catch { return { error: 'The nonce must be a whole number (decimal, or hex with 0x).' }; }
      if (k <= 0n || k >= N) return { error: 'The nonce must lie between 1 and n − 1.' };
      if (params.msg1 === params.msg2) return { error: 'Use two different messages.' };
      const z1 = messageHash(params.msg1), z2 = messageHash(params.msg2);
      const sig1 = sign(z1, TEST_KEY, k), sig2 = sign(z2, TEST_KEY, k);
      const reuse = recoverFromReusedNonce(z1, sig1, z2, sig2);
      const sig3 = sign(z2, TEST_KEY, (k + 1n) % N);
      const related = recoverFromRelatedNonces(z1, sig1, z2, sig3, 1n);
      return { k, z1, z2, sig1, sig2, sig3, reuse, related, valid: verify(z1, TEST_PUB, sig1) && verify(z2, TEST_PUB, sig2) };
    },
    view: (r) => {
      if (r.error) return { answer: { ok: false, text: r.error }, body: [] };
      const okReuse = r.reuse.d === TEST_KEY, okRelated = r.related.d === TEST_KEY;
      return {
        answer: { ok: false, text: `Both signatures are valid — and together they give away the private key: recovered d ${okReuse ? '<strong>equals the test key ✓</strong>' : 'differs ✗'}, and the nonce too. With nonces k and k + 1 the key falls just the same${okRelated ? ' ✓' : ' ✗'}.` },
        body: [
          ...section(1, 'Two valid signatures', `Both verify against the public key ${compressedHex(TEST_PUB).slice(0, 18)}… — nothing looks wrong to a verifier. The giveaway is the repeated r.`),
          hexValue('z₁ = Keccak-256(message 1) mod n', hex(r.z1)),
          hexValue('z₂ = Keccak-256(message 2) mod n', hex(r.z2)),
          hexValue('r — the same in both signatures', hex(r.sig1.r)),
          hexValue('s₁', hex(r.sig1.s)),
          hexValue('s₂', hex(r.sig2.s)),
          facts([['both signatures verify', r.valid ? 'yes' : 'no']]),
          ...section(2, 'The algebra', 's₁k = z₁ + r·d and s₂k = z₂ + r·d: two equations, two unknowns, all mod n.'),
          el('p', { class: 'formula', html: 'k = (z₁ − z₂) · (s₁ − s₂)⁻¹ mod n' }),
          hexValue('recovered nonce k', hex(r.reuse.k)),
          el('p', { class: 'formula', html: 'd = (s₁·k − z₁) · r⁻¹ mod n' }),
          hexValue('recovered private key d', hex(r.reuse.d)),
          facts([['recovered k = the nonce used?', r.reuse.k === r.k ? 'yes ✓' : 'no'], ['recovered d = the test key?', okReuse ? 'yes ✓' : 'no']]),
          ...section(3, 'Related nonces: k and k + 1', 'Different r, so the repetition is no longer visible — but s₁k = z₁ + r₁d and s₂(k + 1) = z₂ + r₂d are still two linear equations.'),
          hexValue('r₂ with nonce k + 1 (different)', hex(r.sig3.r)),
          hexValue('recovered private key d', hex(r.related.d)),
          facts([['recovered d = the test key?', okRelated ? 'yes ✓' : 'no']]),
          el('p', { class: 'caption', html: 'The same linearity in key derivation: the <a href="bip32.html">xpub + child-key leak</a> solves k_par = kᵢ − I_L.' }),
        ],
      };
    },
    why: 'the secret enters the signature linearly, so any relation between nonces turns into a system of equations an attacker can solve.',
    notes: [
      'This is not a bug in the mathematics but in its use — and it has emptied real wallets. Sony signed PlayStation 3 firmware with a constant nonce (2010); a broken Android random generator made Bitcoin wallets repeat nonces (2013); Breitner and Heninger recovered hundreds of real keys from nonces with only a few predictable bits, using lattices (2019).',
      'The fix is to stop choosing nonces: RFC 6979 derives k deterministically from the private key and the message hash, so the same message gives the same k and different messages give unrelated ones. The test key here is public; never sign anything with it.',
    ],
  });
}

/* ---------- S10 · Lamport ---------- */

function s10(params, update) {
  const big = (t) => (1 - 2 ** -t) ** 256;
  const fmtSmall = (x) => (x < 1e-3 ? `2^${Math.log2(x).toFixed(1)}` : pct(x));
  return labPanel({
    exp: 's10', id: 'S10', title: 'S10 · Hash-based signatures have their own fragility', cats: ['hashing'],
    question: 'Lamport signatures need nothing but a hash. What breaks if one key signs more than once?',
    steps: [
      `Make a real Lamport key for an ${params.m}-bit hash: 2 × ${params.m} random secrets, published as their hashes.`,
      'Sign t messages with it. Each signature reveals one secret per bit position — half of them.',
      'A forger takes a new message: if, for every bit of its hash, the needed secret has already been revealed, it assembles a signature — and the public key accepts it.',
      `Theory: each bit is covered with probability 1 − 2^−t, so a forgery succeeds with probability (1 − 2^−t)^${params.m}.`,
    ],
    fields: [
      { key: 'm', label: 'hash bits m', options: [[16, '16'], [24, '24'], [32, '32']], hint: 'the size of the toy hash; real Lamport keys use 256.' },
      { key: 'n', label: 'trials per t', min: 50, max: 20000, hint: 'forgery attempts for each number of signatures t = 1 … 8.' },
      { key: 'seed', label: 'seed', min: 0, max: 4294967295 },
    ],
    params, update,
    view: ({ rows, m }) => {
      const inside = rows.filter((r) => { const [lo, hi] = wilson(r.forged, r.trials); return lo <= r.theory && r.theory <= hi; }).length;
      const at = (t) => rows.find((r) => r.t === t);
      return {
        answer: { ok: false, text: `After 4 signatures the forger succeeds ${pct(at(4).forged / at(4).trials)} of the time (theory ${pct(at(4).theory)}); after 8, ${pct(at(8).forged / at(8).trials)} (theory ${pct(at(8).theory)}) — ${inside} of 8 measured rates contain the theory. Every forgery was accepted by the public key. For a real 256-bit key: 2^${Math.log2(big(2)).toFixed(0)} after two signatures, ${pct(big(8))} after eight.` },
        body: [
          ...section(1, 'Forgery rate against the number of signatures', `Bars: measured share of successful forgeries with an ${m}-bit hash. Line: (1 − 2^−t)^${m}.`),
          chart({
            categories: rows.map((r) => r.t), series: [{ label: 'measured forgery rate', color: MEASURED, values: rows.map((r) => r.forged / r.trials) }],
            overlay: { label: `(1 − 2^−t)^${m}`, color: THEORY, values: rows.map((r) => r.theory) }, xTitle: 'signatures made with the key, t', yTitle: 'forgery rate',
          }),
          table(['t', 'forged / trials', 'rate', 'Wilson 95 %', 'theory', 'accepted by the public key'], rows.map((r) => {
            const [lo, hi] = wilson(r.forged, r.trials);
            return [String(r.t), `${fmt(r.forged)} / ${fmt(r.trials)}`, pct(r.forged / r.trials), `[${pct(lo)}, ${pct(hi)}]`, pct(r.theory), `${fmt(r.verified)} of ${fmt(r.forged)}`];
          })),
          ...section(2, 'The same for a real 256-bit Lamport key (analytic)'),
          table(['signatures t', 'forgery probability (1 − 2^−t)^256'], [1, 2, 3, 4, 6, 8, 10, 12].map((t) => [String(t), fmtSmall(big(t))])),
          ...section(3, 'The other price: size', 'Bytes per signature. Ethereum pays for every byte on chain.'),
          table(['scheme', 'signature', 'assumption'], [
            ['ECDSA (secp256k1)', '64 B (+1 recovery byte)', 'discrete logarithm'],
            ['Lamport, 256-bit hash', '8 KiB (256 × 32 B), one use only', 'hash one-wayness'],
            ['SLH-DSA (FIPS 205), 128s … 256f', '7 856 B … 49 856 B, stateless', 'hash functions only'],
          ]),
        ],
        rows,
      };
    },
    why: '“minimal assumptions” is not “misuse-resistant”: hash-based schemes trade algebraic risk for state and size.',
    notes: [
      'Stateful hash-based schemes (XMSS, LMS) chain many one-time keys and must <em>never</em> reuse one. Backups, virtual-machine snapshots and restored devices can silently break that rule. Stateless SLH-DSA avoids the problem at the cost of 8–50 KB signatures.',
      'Note 06 reports the same check on a 32-bit toy: 0.0136 vs 0.0139 at t = 3, 0.130 vs 0.127 at t = 4, 0.606 vs 0.604 at t = 6.',
    ],
  });
}

/* ---------- S11 · smoothness ---------- */

function s11(params, update) {
  return labPanel({
    exp: 's11', id: 'S11', title: 'S11 · Smooth numbers: why RSA needs 3072 bits and curves 256', cats: ['publickey'],
    question: 'How often is a random integer “smooth” — a product of small primes only — and why does that matter for some groups but not for elliptic curves?',
    steps: [
      `Draw random integers of 20 to 50 bits and divide out every prime up to B = ${fmt(params.B)}.`,
      'Count the ones that reduce to 1: the B-smooth numbers.',
      'Compare with Dickman’s ρ(u), u = ln x / ln B: the theoretical share of smooth numbers.',
    ],
    fields: [
      { key: 'B', label: 'smoothness bound B', options: [[100, '100'], [1000, '1000'], [10000, '10 000']], hint: 'the largest prime allowed in the factorisation (the “factor base”).' },
      { key: 'n', label: 'integers per size N', min: 100, max: 100000, hint: 'random integers drawn at each size, 20 … 50 bits.' },
      { key: 'seed', label: 'seed', min: 0, max: 4294967295 },
    ],
    params, update,
    view: ({ rows, B }) => {
      const data = rows.map((r) => {
        const u = (r.bits * Math.LN2) / Math.log(B);
        const [lo, hi] = wilson(r.smooth, r.n);
        return { ...r, u, rho: dickmanRho(u), rate: r.smooth / r.n, lo, hi };
      });
      const inside = data.filter((d) => d.lo <= d.rho && d.rho <= d.hi).length;
      return {
        answer: { text: `Smooth numbers thin out exactly as Dickman’s ρ predicts (${inside} of ${data.length} intervals contain it): from ${pct(data[0].rate)} at 20 bits to ${pct(data.at(-1).rate, 2)} at 50 bits. Rare, but not exponentially rare — and that is enough for index calculus.` },
        body: [
          ...section(1, 'Share of B-smooth integers, against ρ(u)', 'Bars: log₁₀ of the measured share (0 events are left out). Dots: log₁₀ ρ(u). A logarithmic scale, because the share drops by a factor of a thousand.'),
          chart({
            categories: data.map((d) => `${d.bits} bits`),
            series: [{ label: 'log₁₀ measured share', color: MEASURED, values: data.map((d) => (d.smooth ? Math.log10(d.rate) : 0)) }],
            overlay: { label: 'log₁₀ ρ(u)', color: THEORY, values: data.map((d) => Math.log10(d.rho)), dots: true }, xTitle: 'size of the integers', yTitle: 'log₁₀ share',
          }),
          table(['size', 'u = ln x / ln B', 'smooth / N', 'share', 'Wilson 95 %', 'ρ(u)'], data.map((d) => [
            `${d.bits} bits`, d.u.toFixed(2), `${fmt(d.smooth)} / ${fmt(d.n)}`, pct(d.rate, 2), `[${pct(d.lo, 2)}, ${pct(d.hi, 2)}]`, pct(d.rho, 2),
          ])),
        ],
        rows: data.map(({ bits, u, smooth, n, rate, rho }) => ({ bits, u, smooth, n, rate, rho })),
      };
    },
    why: 'integers have a statistical regularity — smoothness — that gives sub-exponential attacks; elliptic-curve points have none known.',
    notes: [
      'Index calculus, the best attack on factoring and on discrete logarithms modulo a prime, collects many group elements that factor completely over a small “factor base” of primes. Because smooth numbers are only polynomially-in-u rare (the curve above), the attack is sub-exponential — which is why RSA and finite-field Diffie–Hellman need 3072-bit numbers for the security a 256-bit curve gives.',
      'An elliptic-curve point has no notion of “factoring into small points”. Semaev’s summation polynomials are the research attempt to invent one; they have produced no practical attack on prime-field curves. This is exactly the kind of idea a much stronger mathematician would look for <span class="evidence opinion">opinion</span>.',
    ],
  });
}

/* ---------- the page ---------- */

const EXPERIMENTS = [
  { id: 'S7', label: 'S7 · Shor in miniature', panel: s7, defaults: { curve: 'C0', k: 13 } },
  { id: 'S8', label: 'S8 · structure test', panel: s8, defaults: { n: 1000, seed: 1 } },
  { id: 'S9', label: 'S9 · nonce reuse', panel: s9, defaults: { msg1: 'pay Alice 1 ETH', msg2: 'pay Bob 2 ETH', nonce: '123456789' } },
  { id: 'S10', label: 'S10 · Lamport reuse', panel: s10, defaults: { m: 32, n: 1500, seed: 1 } },
  { id: 'S11', label: 'S11 · smooth numbers', panel: s11, defaults: { B: 1000, n: 4000, seed: 1 } },
];
const NUMERIC = { k: [1, 138], n: [1, 100000], seed: [0, 4294967295], m: [16, 32], B: [100, 10000] };

function paramsFor(x, state) {
  const out = {};
  for (const [key, def] of Object.entries(x.defaults)) {
    const raw = state[key];
    if (typeof def === 'string') { out[key] = raw ?? def; continue; }
    const v = Number(raw);
    out[key] = raw !== undefined && raw !== '' && Number.isFinite(v) ? Math.max(NUMERIC[key][0], Math.min(NUMERIC[key][1], Math.round(v))) : def;
  }
  if (x.id === 'S7') {
    if (!TOY_CURVES[out.curve]) out.curve = 'C0';
    const c = TOY_CURVES[out.curve];
    if (state.k === undefined) out.k = c.k;
    out.k = Math.max(1, Math.min(c.n - 1, out.k));
  }
  if (x.id === 'S10') out.m = [16, 24, 32].includes(out.m) ? out.m : 32;
  if (x.id === 'S11') out.B = [100, 1000, 10000].includes(out.B) ? out.B : 1000;
  return out;
}

startPage({
  shell: hw02Shell('structure.html'),
  render: ({ state, update }) => {
    const x = EXPERIMENTS.find((e) => e.id === state.exp) ?? EXPERIMENTS[0];
    const clear = { ...Object.fromEntries([...Object.keys(NUMERIC), 'curve', 'msg1', 'msg2', 'nonce', 'pu', 'pv'].map((k) => [k, null])) };
    const picker = el('nav', { class: 'tabs lab-tabs', 'aria-label': 'experiments' }, EXPERIMENTS.map((e) => el('a', {
      href: `?exp=${e.id}`, text: e.label, 'aria-current': e.id === x.id ? 'page' : null,
      onclick: (ev) => { ev.preventDefault(); update({ ...clear, exp: e.id }); },
    })));
    // a change of curve or k invalidates a picked peak
    const guarded = (changes) => update(x.id === 'S7' && ('curve' in changes || 'k' in changes) ? { ...changes, pu: null, pv: null } : changes);
    return [
      argumentPanel(),
      el('div', { class: 'card' }, [el('p', { class: 'small muted', style: 'margin:0 0 8px', text: 'The experiments — one at a time:' }), picker]),
      x.panel(paramsFor(x, state), guarded, state),
    ];
  },
});
