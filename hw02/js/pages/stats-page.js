/* stats-page.js — the statistics lab, S1–S6 (spec §6.6, note 07). One
   experiment at a time, chosen by ?exp=; each shows its parameters (N, seed),
   a plot, a table, estimates with Wilson intervals or tests with p-values,
   the theoretical value next to the measured one, notes and export.
   The heavy work runs in a Web Worker (js/core/lab/*.js). */

import { el, fmt } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { barChart } from '../../../assets/js/ui/barchart.js';
import { chartLegend } from '../../../assets/js/ui/linechart.js';
import { load, save } from '../../../assets/js/ui/store.js';
import {
  wilson, meanCI, median, binomialPmf, geometricCdf, geometricMedian, criticalZ, bonferroni, ruleOfThree,
} from '../../../assets/js/core/stats.js';
import { WORDS_CHANGED } from '../core/lab/s2.js';
import { facts, humanTime } from './widgets.js';
import { labPanel } from './lab-panel.js';
import { hw02Shell } from './shell.js';

const MEASURED = 'var(--s1)', THEORY = 'var(--s2)';
const pf = (p) => (p < 0.001 ? '< 0.001' : p.toFixed(3));
const pct = (x, digits = 3) => `${(100 * x).toPrecision(digits)} %`;
const table = (head, rows, cls = 'data') => el('div', { class: 'scroll-x' }, [el('table', { class: cls }, [
  el('thead', {}, [el('tr', {}, head.map((h, i) => el('th', { class: i ? null : 'left', text: h })))]),
  el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => (c instanceof Node ? el('td', { class: i ? null : 'left' }, [c]) : el('td', { class: i ? null : 'left', text: c })))))),
])]);
const chart = (opts) => el('div', {}, [barChart(opts), chartLegend([...opts.series, ...(opts.overlay ? [opts.overlay] : [])])]);
const verdict = (ok, yes, no) => el('span', { class: ok ? 'ok' : 'err', text: ok ? yes : no });

/** Counts of integer values in bins of `width` from lo to hi, with the theory
 *  per bin from a probability mass function, scaled to the sample size. */
function histogram(values, lo, hi, width, pmf) {
  const bins = Math.ceil((hi - lo + 1) / width);
  const counts = new Array(bins).fill(0), theory = new Array(bins).fill(0), labels = [];
  for (const v of values) if (v >= lo && v <= hi) counts[Math.floor((v - lo) / width)]++;
  for (let b = 0; b < bins; b++) {
    labels.push(lo + b * width);
    for (let v = lo + b * width; v < lo + (b + 1) * width && v <= hi; v++) theory[b] += values.length * pmf(v);
  }
  return { labels, counts, theory };
}

/* ---------- S1 · entropy pipe ---------- */

function s1(params, update) {
  const ent = params.words === 24 ? 256 : 128, cs = ent / 32;
  const H = Math.min(params.source, ent);
  const stages = [
    ['entropy', ent, ent, 'the generated secret'],
    ['mnemonic', ent + cs, ent + cs, `${ent} bits + ${cs} checksum bits (redundant)`],
    ['seed', 512, 512, 'PBKDF2 output'],
    ['master key + chain code', 512, 512, '256 + 256 bits'],
    ['private key k', 256, 256, 'one point of the tree'],
    ['public key Q = (x, y)', 512, 257, 'x plus the sign of y: ≈ 257 bits of information'],
    ['address', 160, 160, 'last 20 bytes of Keccak-256'],
    ['EIP-55 address', 160, 160, 'plus ≈ 15 check bits in the letter case'],
  ];
  return labPanel({
    exp: 's1', id: 'S1', title: 'S1 · The entropy pipe', cats: ['generation'],
    formula: 'secret entropy at every stage ≤ min(entropy of the source, size of the representation) &nbsp;—&nbsp; H(f(X)) ≤ H(X)',
    fields: [
      { key: 'words', label: 'words', options: [[12, '12 (128 bits)'], [24, '24 (256 bits)']] },
      { key: 'source', label: 'entropy of the source, bits', min: 1, max: 256 },
    ],
    params, update,
    compute: () => stages.map(([stage, size, info]) => ({ stage, size, information: info, secret: Math.min(H, size) })),
    view: (rows) => ({
      body: [
        chart({
          categories: rows.map((r, i) => i + 1),
          series: [{ label: 'size of the representation (bits)', color: THEORY, values: rows.map((r) => r.size) },
            { label: 'secret entropy (bits)', color: MEASURED, values: rows.map((r) => r.secret) }],
          xTitle: 'stage (numbered as in the table)', yTitle: 'bits',
        }),
        table(['stage', 'size (bits)', 'information (bits)', 'secret entropy (bits)', ''],
          rows.map((r, i) => [`${i + 1}. ${r.stage}`, String(r.size), String(r.information), String(r.secret), stages[i][3]])),
        H < ent ? el('p', { class: 'err', style: 'margin-top:10px', text: `A source of only ${H} bits: every stage still looks like ${ent}–512 random bits, but an attacker enumerates 2^${H} possibilities.` }) : null,
      ],
      rows,
    }),
    why: 'it separates the size of a value from the amount of secret in it — the distinction every later experiment depends on.',
    notes: [
      'The bars of the representation grow (512-bit seed and public key) and shrink (160-bit address), but the secret never exceeds what the generator produced: every step after generation is a deterministic function, and <span class="eq">H(f(X)) ≤ H(X)</span>.',
      'The public key has 512 bits but only about 257 bits of information: given <span class="eq">x</span>, <span class="eq">y</span> is fixed up to its sign. The address is a compression of it; the wallet’s security stays at 128 bits, set by the entropy (and, separately, by the ECDLP).',
      'Lower the entropy of the source to 32 — a Milk Sad–style generator — or 40, the reported Coldcard Mk2/Mk3 figure: nothing in the representation changes, and nothing in the statistics of the outputs either (S5).',
    ],
  });
}

/* ---------- S2 · avalanche ---------- */

function s2(params, update) {
  return labPanel({
    exp: 's2', id: 'S2', title: 'S2 · Avalanche through the pipeline', cats: ['derivation', 'hashing'],
    formula: 'flip one random entropy bit → count changed words and changed bits; ideal: Binomial(size, ½)',
    fields: [{ key: 'n', label: 'trials N', min: 10, max: 5000 }, { key: 'seed', label: 'seed', min: 0, max: 4294967295 }],
    params, update,
    view: ({ rows }) => {
      const N = rows.length;
      const stages = [['seed', 512], ['key', 256], ['address', 160]];
      const w = meanCI(rows.map((r) => r.words));
      const pw = WORDS_CHANGED, wTheory = pw[1] + 2 * pw[2], wSd = Math.sqrt(pw[1] + 4 * pw[2] - wTheory ** 2);
      const summary = [['words of 12', w, wTheory, wSd], ...stages.map(([k, size]) => [`${k} bits of ${size}`, meanCI(rows.map((r) => r[k])), size / 2, Math.sqrt(size) / 2])];
      const charts = stages.map(([k, size]) => {
        const sd = Math.sqrt(size) / 2, lo = Math.floor(size / 2 - 4 * sd), hi = Math.ceil(size / 2 + 4 * sd);
        const h = histogram(rows.map((r) => r[k]), lo, hi, size > 300 ? 3 : 2, (v) => binomialPmf(size, v, 0.5));
        return el('div', {}, [el('h3', { text: `${k}: bits changed of ${size}` }), chart({
          categories: h.labels, series: [{ label: 'measured', color: MEASURED, values: h.counts }],
          overlay: { label: `Binomial(${size}, ½) × N`, color: THEORY, values: h.theory }, xTitle: 'bits changed', yTitle: 'trials',
        })]);
      });
      const wordCounts = [0, 1, 2, 3].map((c) => rows.filter((r) => r.words === c).length);
      return {
        body: [
          table(['stage', 'measured mean', '95 % CI', 'theory', 'measured sd', 'theory sd'],
            summary.map(([name, c, th, sd]) => [name, c.mean.toFixed(3), `[${c.lo.toFixed(2)}, ${c.hi.toFixed(2)}]`, th.toFixed(3), c.sd.toFixed(2), sd.toFixed(2)])),
          el('div', { class: 'charts' }, [
            el('div', {}, [el('h3', { text: 'words changed' }), chart({
              categories: [0, 1, 2, 3], series: [{ label: 'measured', color: MEASURED, values: wordCounts }],
              overlay: { label: 'exact law × N', color: THEORY, values: [0, N * pw[1], N * pw[2], 0], dots: true }, xTitle: 'words changed', yTitle: 'trials',
            })]),
            ...charts,
          ]),
        ],
        rows,
        summary: Object.fromEntries(summary.map(([name, c, th]) => [name, { mean: c.mean, lo: c.lo, hi: c.hi, theory: th }])),
      };
    },
    why: 'after the first derivation, a one-bit change should be indistinguishable from starting over — that is what “behaves like a random function” means.',
    notes: [
      'Each trial runs the complete pipeline twice: PBKDF2, five BIP-32 levels, <span class="eq">kG</span> and Keccak. If every stage behaves like an independent random function, the number of changed bits is <span class="eq">Binomial(size, ½)</span>: mean <span class="eq">size/2</span>, standard deviation <span class="eq">√size / 2</span>.',
      'The words are different: a flipped bit changes its own word and, in 15 cases out of 16, the 4 checksum bits in the last word. Exact law: one word with probability 7/128 + (121/128)(1/16), two with probability (121/128)(15/16); mean 1.886.',
      'Contrast with <span class="eq">k ↦ kG</span> alone: changing <span class="eq">k</span> to <span class="eq">k + 1</span> changes <span class="eq">Q</span> “a lot” but predictably (<span class="eq">Q + G</span>). Avalanche is a property of the hash-based steps, not of the curve.',
    ],
  });
}

/* ---------- S3 / S5a · tests on addresses ---------- */

function testRows(t) {
  const family = 4;   // the four headline tests below, corrected together
  const line = (name, stat, p) => [name, stat, pf(p), pf(bonferroni(p, family)), verdict(bonferroni(p, family) >= 0.05, 'consistent', 'flagged')];
  return [
    line('hex-digit χ² (16 categories)', `${t.hex.stat.toFixed(2)}, df ${t.hex.df}`, t.hex.p),
    line('byte χ² (256 categories)', `${t.bytes.stat.toFixed(1)}, df ${t.bytes.df}`, t.bytes.p),
    line('monobit', `prop. ${t.monobit.proportion.toFixed(5)}, z = ${t.monobit.z.toFixed(2)}`, t.monobit.p),
    line('largest of 160 per-position z (p already × 160)', `|z| = ${Math.abs(t.positions.maxZ).toFixed(2)} at bit ${t.positions.maxAt}`, t.positions.pBonferroni),
  ];
}
const testsTable = (t) => table(['test', 'statistic', 'p', 'p × 4 (Bonferroni)', 'at 5 %'], testRows(t));

/** Hex digits as standardised residuals (O − E)/√E: their squares add up to
 *  the χ² statistic, so the bars show which digits contribute to it. */
function hexChart(t) {
  const expected = t.hex.counts.reduce((s, c) => s + c, 0) / 16;
  return chart({
    categories: [...'0123456789abcdef'],
    series: [{ label: '(observed − expected) / √expected', color: MEASURED, values: t.hex.counts.map((c) => (c - expected) / Math.sqrt(expected)) }],
    refLines: [{ y: 2, label: '+2' }, { y: -2, label: '−2' }], xTitle: 'hex digit', yTitle: 'residual',
  });
}

const REPLICATIONS = 'hw02.lab.S3.replications';

function s3(params, update) {
  return labPanel({
    exp: 's3', id: 'S3', title: 'S3 · Are addresses uniform?', cats: ['hashing'],
    formula: 'N addresses from random keys → hex-digit χ², byte χ², monobit, 160 per-position z-tests (Bonferroni)',
    fields: [{ key: 'n', label: 'addresses N', min: 100, max: 60000 }, { key: 'seed', label: 'seed', min: 0, max: 4294967295 }],
    params, update,
    view: ({ tests: t, sample }) => {
      const crit = criticalZ(0.05, 160);
      // every completed run is a replication row, kept in this browser
      const rows = load(REPLICATIONS, []);
      if (!rows.some((r) => r.seed === params.seed && r.n === params.n)) {
        rows.push({ seed: params.seed, n: params.n, hexP: t.hex.p, byteP: t.bytes.p, monobitZ: t.monobit.z, maxZ: t.positions.maxZ, at: t.positions.maxAt, bonferroni: t.positions.pBonferroni });
        save(REPLICATIONS, rows);
      }
      const replicate = () => update({ seed: String(globalThis.crypto.getRandomValues(new Uint32Array(1))[0]) });
      return {
        body: [
          testsTable(t),
          el('div', { class: 'charts' }, [
            el('div', {}, [el('h3', { text: 'hex digits: residuals (Σ residual² = χ²)' }), hexChart(t)]),
            el('div', {}, [el('h3', { text: 'z per bit position' }), chart({
              categories: t.positions.z.map((_, i) => i), series: [{ label: 'z of the share of ones', color: MEASURED, values: t.positions.z }],
              refLines: [{ y: crit, label: `+${crit.toFixed(2)}` }, { y: -crit, label: `−${crit.toFixed(2)} (Bonferroni, 160 tests)` }],
              xTitle: 'bit position in the address', yTitle: 'z',
            })]),
          ]),
          facts([
            ['uppercase among letters (EIP-55; ideal ½)', t.eip55.upperShare.toFixed(4)],
            ['letters per address (ideal 15 = 40 × 6/16)', t.eip55.lettersPerAddress.toFixed(2)],
          ]),
          el('h3', { text: 'Replications in this browser' }),
          table(['seed', 'N', 'hex p', 'byte p', 'monobit z', 'max |z| (bit)', 'Bonferroni p'],
            rows.map((r) => [String(r.seed), fmt(r.n), pf(r.hexP), pf(r.byteP), r.monobitZ.toFixed(2), `${Math.abs(r.maxZ).toFixed(2)} (${r.at})`, pf(r.bonferroni)])),
          el('div', { class: 'row', style: 'margin-top:10px' }, [
            el('button', { class: 'primary', type: 'button', text: 'Replicate with a new seed', onclick: replicate }),
            el('button', { type: 'button', text: 'Clear the table', onclick: () => { save(REPLICATIONS, []); update({}); } }),
          ]),
        ],
        rows: sample.map((address, i) => ({ i, address })),
        summary: { tests: testRows(t).map((r) => r.slice(0, 4)), replications: rows },
      };
    },
    why: 'it checks that the address step looks uniform — and shows how often a test that runs many times “finds” something by chance.',
    notes: [
      'Each run performs 164 tests: two χ², one monobit and one z-test per bit position. At the 5 % level about one in twenty tests is “significant” by chance alone, so a single small p-value in this table means nothing. The Bonferroni column multiplies each p by the number of headline tests; the per-position line is already corrected for its 160 tests.',
      'Replicate: press the button a few times and watch the “anomalies” move from bit to bit and test to test. A real bias would replicate; chance does not — though note 07 reports one monobit deviation that replicated once before vanishing in larger samples. The cure was more data and a direct test of Keccak.',
      'What these tests can show is a <em>distribution</em>. They cannot show where the keys came from: S5 feeds them keys from a 16-bit seed and they pass just the same.',
    ],
  });
}

/* ---------- S4 · checksum detection ---------- */

function s4(params, update) {
  return labPanel({
    exp: 's4', id: 'S4', title: 'S4 · How often do the checksums miss?', cats: ['encoding', 'checksum'],
    formula: 'pass rate of an error = k / N, with a Wilson 95 % interval, against 1/16, 1/256 and (13/16)⁴⁰',
    fields: [
      { key: 'n', label: 'BIP-39 trials N', min: 1000, max: 1000000 },
      { key: 'm', label: 'EIP-55 trials', min: 1000, max: 1000000 },
      { key: 'seed', label: 'seed', min: 0, max: 4294967295 },
    ],
    params, update,
    view: ({ events, letters, byLetters }) => {
      const M = letters.reduce((s, c) => s + c, 0);
      const Ls = Array.from({ length: 24 }, (_, i) => i + 4);
      const rows = events.map((e) => {
        const [lo, hi] = wilson(e.k, e.n);
        return { test: e.test, k: e.k, n: e.n, estimate: e.k / e.n, lo, hi, theory: e.theory, inside: lo <= e.theory && e.theory <= hi };
      });
      return {
        body: [
          table(['event', 'k / N', 'estimate', 'Wilson 95 %', 'theory', 'theory inside?'],
            rows.map((r) => [r.test, `${fmt(r.k)} / ${fmt(r.n)}`, pct(r.estimate), `[${pct(r.lo)}, ${pct(r.hi)}]`, pct(r.theory), verdict(r.inside, 'yes', 'no')])),
          rows.at(-1).k === 0 ? el('p', { class: 'small muted', text: `No EIP-55 miss observed: the rule of three bounds the rate at ${pct(ruleOfThree(rows.at(-1).n))}.` }) : null,
          el('div', { class: 'charts' }, [
            el('div', {}, [el('h3', { text: 'letters per address' }), chart({
              categories: Ls, series: [{ label: 'measured', color: MEASURED, values: Ls.map((L) => letters[L]) }],
              overlay: { label: 'Binomial(40, 6/16) × N', color: THEORY, values: Ls.map((L) => M * binomialPmf(40, L, 6 / 16)) }, xTitle: 'letters L = check bits', yTitle: 'addresses',
            })]),
            el('div', {}, [el('h3', { text: 'EIP-55 misses by letter count' }), table(['letters L', 'typos', 'missed', 'rate', '2^−L'],
              Ls.filter((L) => byLetters[L].trials >= 200).map((L) => [String(L), fmt(byLetters[L].trials), String(byLetters[L].missed), pct(byLetters[L].missed / byLetters[L].trials, 2), pct(2 ** -L, 2)]))]),
          ]),
        ],
        rows,
      };
    },
    why: 'a checksum is only as good as its measured miss rate — and EIP-55’s depends on the address.',
    notes: [
      'BIP-39: 4 checksum bits for 12 words, 8 for 24. A random phrase, a replaced word or two swapped words pass when the 4 (or 8) bits happen to match: probability 1/16 (or 1/256). The checksum is a hash, so any change re-rolls it.',
      'EIP-55: each letter of the typed address is one check bit, so a typo slips through with probability <span class="eq">2^−L</span>, and on average <span class="eq">(13/16)⁴⁰ ≈ 0.0247 %</span>. Misses come mostly from letter-poor addresses (right-hand table).',
      'For rare events the simulation is coarse: 100 000 trials give only about 25 EIP-55 misses, a relative error near 20 %. The interval contains the formula, which is exact and more precise than any affordable simulation.',
    ],
  });
}

/* ---------- S5 · weak entropy ---------- */

function s5a(params, update) {
  return labPanel({
    exp: 's5a', id: 'S5a', title: 'S5(a) · Weak keys pass the tests', cats: ['generation'],
    formula: 'k = SHA-256(seed) mod (n − 1) + 1 with a b-bit seed → addresses → the same tests as S3',
    fields: [{ key: 'bits', label: 'seed bits b', min: 4, max: 24 }, { key: 'n', label: 'addresses N', min: 100, max: 60000 }, { key: 'seed', label: 'seed', min: 0, max: 4294967295 }],
    params, update,
    view: ({ tests: t, distinctSeeds, space }) => ({
      body: [
        facts([
          ['possible keys from this generator', `2^${params.bits} = ${fmt(space)}`],
          ['possible keys for a 12-word wallet', '2^128 ≈ 3.4·10³⁸'],
          ['distinct seeds among these addresses', fmt(distinctSeeds)],
        ]),
        el('div', { style: 'margin-top:12px' }, [testsTable(t)]),
        el('h3', { text: 'hex digits: residuals (Σ residual² = χ²)' }), hexChart(t),
      ],
      summary: { tests: testRows(t).map((r) => r.slice(0, 4)), distinctSeeds, space },
    }),
    why: 'it shows that statistical tests on outputs cannot detect a tiny key space — S5(b) breaks the same generator in seconds.',
    notes: [
      'This is a scaled-down Profanity / Milk Sad / Trust Wallet bug: a small seed stretched by a hash into a 256-bit key. Each address is a hash of a curve point, so it looks exactly as uniform as a real one — the tests see the output <em>distribution</em>, not the input <em>space</em>.',
      'Read the p-values with the same care as in S3: a single value below 0.05 among four is expected one time in five, which is why the Bonferroni column is there. What matters is that nothing distinguishes these 2^b keys from 2¹²⁸ — and nothing could.',
      'Only knowledge of the generation process (or an enumeration that succeeds) reveals the entropy. That is why NIST SP 800-90B assesses the noise source, not the output.',
    ],
  });
}

function s5b(params, update) {
  return labPanel({
    exp: 's5b', id: 'S5b', title: 'S5(b) · The same weak keys, brute-forced', cats: ['generation'],
    formula: 'for s = 0, 1, 2, …: address(SHA-256(s) mod (n − 1) + 1) = victim’s address?',
    fields: [{ key: 'bits', label: 'seed bits b', min: 4, max: 22 }, { key: 'seed', label: 'seed (picks the victim)', min: 0, max: 4294967295 }],
    params, update,
    view: (r) => {
      const gpu = 1e9;
      const spaces = [[`2^${params.bits} (this run)`, r.space], ['2^32 (Milk Sad, Trust Wallet)', 2 ** 32], ['2^40 (reported Coldcard Mk2/Mk3)', 2 ** 40], ['2^128 (a 12-word wallet)', 2 ** 128]];
      return {
        body: [
          facts([
            ['victim’s address', `0x${r.target}`],
            ['victim’s seed / found', `${r.victim} / ${r.found}`],
            ['candidates tried', fmt(r.tried)],
            ['time in this Web Worker', humanTime(r.ms / 1000)],
            ['rate (SHA-256 + kG + Keccak per candidate)', `${fmt(Math.round(r.rate))} keys/s`],
          ]),
          el('h3', { text: 'The same search, scaled' }),
          table(['key space', 'expected tries (half)', 'at this rate', 'at 10⁹ keys/s (GPU-class)'],
            spaces.map(([label, s]) => [label, s < 1e12 ? fmt(s / 2) : (s / 2).toExponential(1), humanTime(s / 2 / r.rate), humanTime(s / 2 / gpu)])),
        ],
        rows: [{ bits: params.bits, victim: r.victim, found: r.found, tried: r.tried, ms: Math.round(r.ms), rate: Math.round(r.rate) }],
      };
    },
    why: 'it turns S5(a)’s invisible weakness into a stolen key.',
    notes: [
      'The attacker knows the generator, not the seed. Enumerating the seeds and comparing addresses finds the victim after, on average, half the space. Here that is one browser core; the real attacks on 32-bit generators used GPUs and swept thousands of wallets.',
      'The last row is the point of the whole pipeline: with 128 bits of entropy, the same search would outlast the universe by many orders of magnitude. Nothing after the generator changes that number in either direction.',
    ],
  });
}

function s5c(params, update) {
  return labPanel({
    exp: 's5c', id: 'S5c', title: 'S5(c) · The Coldcard model', cats: ['generation'],
    formula: 'pad = UID ⊕ timer → two Yasmarang PRNGs XORed → SHA-256d → 24 words → PBKDF2 → m/84’/0’/0’/0/0',
    fields: [{ key: 'timer', label: 'timer range, bits', min: 4, max: 17 }, { key: 'n', label: 'seeds for the tests N', min: 100, max: 20000 }, { key: 'seed', label: 'seed', min: 0, max: 4294967295 }],
    params, update,
    view: (r) => {
      const real = 80000, gpu = 1e6;
      const st = (s) => [`${s.bytes.stat.toFixed(1)}, df 255`, pf(s.bytes.p), s.monobit.proportion.toFixed(4), s.monobit.z.toFixed(2)];
      return {
        body: [
          el('h3', { text: `What a test sees: ${fmt(r.n)} seeds from random 32-bit starting states` }),
          table(['output', 'byte χ²', 'p', 'share of ones', 'z'], [['raw PRNG bytes', ...st(r.stats.raw)], ['after SHA-256d (what the device used)', ...st(r.stats.hashed)]]),
          el('h3', { text: 'What an attacker does: try every timer value' }),
          facts([
            ['chip-ID word (known)', `0x${r.uid.toString(16).padStart(8, '0')}`],
            ['timer range searched', `0 … ${fmt(r.range - 1)} (2^${params.timer})`],
            ['victim’s timer / found', `${r.timer} / ${r.found}`],
            ['candidates tried', fmt(r.tried)],
            ['time, rate', `${humanTime(r.ms / 1000)}, ${r.rate.toFixed(0)} candidates/s (PBKDF2 + BIP-32 + kG each)`],
            ['public key compared, at ' + r.path, r.victimPub],
          ]),
          r.words ? el('p', { class: 'hex', style: 'margin-top:10px' }, [el('strong', { text: 'Recovered 24 words: ' }), r.words.join(' ')]) : null,
          el('h3', { text: 'Scaled to the real device' }),
          table(['states', 'at this rate', 'at 10⁶ PBKDF2/s (GPU-class)'], [
            [`real Mk2/Mk3 timer range, ≈ ${fmt(real)}`, humanTime(real / r.rate), humanTime(real / gpu)],
            ['all 2^32 starting pads', humanTime(2 ** 32 / r.rate), humanTime(2 ** 32 / gpu)],
          ]),
        ],
        rows: [{ timerBits: params.timer, timer: r.timer, found: r.found, tried: r.tried, ms: Math.round(r.ms), rawByteP: r.stats.raw.bytes.p, hashedByteP: r.stats.hashed.bytes.p }],
      };
    },
    why: 'a real hardware wallet produced valid, uniform-looking, guessable seeds for five years; this is its generator, in miniature.',
    notes: [
      'From 2021 to 2026 Coldcard seeds came not from the chip’s hardware RNG but from MicroPython’s fallback Yasmarang generator, seeded with a chip-ID word XOR a timer value, XORed with libngu’s own Yasmarang copy that starts from public constants. A preprocessor guard written as <span class="eq">#ifndef</span> instead of <span class="eq">#if !</span> let it compile (note 09).',
      'The output passes the tests even <em>before</em> hashing: Yasmarang mixes well. Its weakness is only its tiny, guessable state — about 80 000 timer values once the ID word is known. SHA-256d then makes it look perfect; it cannot add entropy.',
      'The model is simplified as in note 09 §6: Mk2/Mk3 path, RTC registers at 0, no earlier draws, no secure-element reseed. The shape of the real attack is exactly this: enumerate states, derive, compare with public keys on the blockchain, sweep.',
    ],
  });
}

/* ---------- S6 · waiting times ---------- */

function s6(params, update) {
  const p = 16 ** -params.k;
  return labPanel({
    exp: 's6', id: 'S6', title: 'S6 · Vanity and look-alike addresses: waiting times', cats: ['hashing'],
    formula: `tries until the first ${params.k} hex characters match ~ Geometric(16^−${params.k}): mean 16^${params.k} = ${fmt(16 ** params.k)}, median ≈ 16^${params.k}·ln 2`,
    fields: [{ key: 'k', label: 'matched characters k', min: 1, max: 5 }, { key: 'runs', label: 'searches', min: 10, max: 20000 }, { key: 'seed', label: 'seed', min: 0, max: 4294967295 }],
    params, update,
    view: ({ tries }) => {
      const c = meanCI(tries), q = [...tries].sort((a, b) => a - b)[Math.floor(0.98 * (tries.length - 1))];
      const width = Math.max(1, Math.ceil(q / 30));
      const bins = Math.ceil(q / width);
      const counts = new Array(bins).fill(0);
      for (const t of tries) if (t <= bins * width) counts[Math.floor((t - 1) / width)]++;
      const theory = counts.map((_, b) => tries.length * (geometricCdf((b + 1) * width, p) - geometricCdf(b * width, p)));
      const rate = 2e9;
      return {
        body: [
          table(['quantity', 'measured', 'theory'], [
            ['mean tries (95 % CI)', `${fmt(Math.round(c.mean))} [${fmt(Math.round(c.lo))}, ${fmt(Math.round(c.hi))}]`, fmt(16 ** params.k)],
            ['median tries', fmt(median(tries)), fmt(geometricMedian(p))],
            ['standard deviation', fmt(Math.round(c.sd)), fmt(Math.round(Math.sqrt(1 - p) / p))],
          ]),
          chart({
            categories: counts.map((_, b) => b * width + 1), series: [{ label: 'searches', color: MEASURED, values: counts }],
            overlay: { label: 'Geometric × searches', color: THEORY, values: theory }, xTitle: 'tries until the match', yTitle: 'searches',
          }),
          el('h3', { text: 'Look-alike addresses, scaled (2·10⁹ tries/s)' }),
          table(['characters matched', 'expected tries', 'time'], [
            ...[8, 9, 10, 12].map((ch) => [`${ch} (e.g. ${Math.floor(ch / 2)} first + ${Math.ceil(ch / 2)} last)`, (16 ** ch).toExponential(1), humanTime(16 ** ch / rate)]),
            ['all 40', '2^160 ≈ 1.5·10⁴⁸', humanTime(2 ** 160 / rate)],
          ]),
        ],
        rows: tries.map((t, i) => ({ search: i + 1, tries: t })),
        summary: { k: params.k, runs: tries.length, mean: c.mean, median: median(tries), theoryMean: 16 ** params.k, theoryMedian: geometricMedian(p) },
      };
    },
    why: 'vanity addresses, address poisoning and brute force all wait for the same thing — a hash that happens to match.',
    notes: [
      'Each try succeeds independently with probability <span class="eq">p = 16^−k</span>, so the number of tries is geometric: memoryless, long-tailed, mean <span class="eq">1/p</span>, median <span class="eq">ln 2 / p</span> — the median is about 30 % below the mean, as the table shows.',
      'Every extra hex character multiplies the cost by 16. An attacker who wants an address matching your first four and last four characters needs about 16⁸ ≈ 4·10⁹ tries — seconds on a GPU. That is the address-poisoning attack: a look-alike sent to you in a tiny transaction, hoping you copy it from your history.',
      'Checking all 40 characters costs the attacker <span class="eq">16⁴⁰ = 2¹⁶⁰</span>: the full address is safe, a glance at its ends is not. Each try here hashes random input with Keccak-256; real vanity tools use public keys, which gives the same law.',
    ],
  });
}

/* ---------- the page ---------- */

const EXPERIMENTS = [
  { id: 'S1', label: 'S1 · entropy pipe', panel: s1, defaults: { words: 12, source: 128 } },
  { id: 'S2', label: 'S2 · avalanche', panel: s2, defaults: { n: 300, seed: 1 } },
  { id: 'S3', label: 'S3 · uniformity', panel: s3, defaults: { n: 6000, seed: 1 } },
  { id: 'S4', label: 'S4 · checksums', panel: s4, defaults: { n: 100000, m: 100000, seed: 1 } },
  { id: 'S5a', label: 'S5a · weak keys pass', panel: s5a, defaults: { bits: 16, n: 4000, seed: 1 } },
  { id: 'S5b', label: 'S5b · weak keys broken', panel: s5b, defaults: { bits: 16, seed: 1 } },
  { id: 'S5c', label: 'S5c · Coldcard model', panel: s5c, defaults: { timer: 12, n: 4000, seed: 1 } },
  { id: 'S6', label: 'S6 · waiting times', panel: s6, defaults: { k: 3, runs: 300, seed: 1 } },
];
const LIMITS = { n: [1, 1e6], m: [1, 1e6], seed: [0, 4294967295], bits: [4, 24], timer: [4, 17], k: [1, 5], runs: [1, 20000], words: [12, 24], source: [1, 256] };

/** Parameters from the URL, defaulted and clamped, as numbers. */
function paramsFor(x, state) {
  const out = {};
  for (const [key, def] of Object.entries(x.defaults)) {
    const v = Number(state[key]);
    const [lo, hi] = LIMITS[key];
    out[key] = Number.isFinite(v) && state[key] !== undefined && state[key] !== '' ? Math.max(lo, Math.min(hi, Math.round(v))) : def;
  }
  if (x.id === 'S1') { out.words = out.words === 24 ? 24 : 12; out.source = Math.min(out.source, out.words === 24 ? 256 : 128); }
  return out;
}

startPage({
  shell: hw02Shell('stats.html'),
  render: ({ state, update }) => {
    const x = EXPERIMENTS.find((e) => e.id === state.exp) ?? EXPERIMENTS[0];
    const clear = Object.fromEntries(Object.keys(LIMITS).map((k) => [k, null]));
    const picker = el('nav', { class: 'tabs lab-tabs', 'aria-label': 'experiments' }, EXPERIMENTS.map((e) => el('a', {
      href: `?exp=${e.id}`, text: e.label, 'aria-current': e.id === x.id ? 'page' : null,
      onclick: (ev) => { ev.preventDefault(); update({ ...clear, exp: e.id }); },
    })));
    return [el('div', { class: 'card' }, [picker]), x.panel(paramsFor(x, state), update)];
  },
});
