/* stats-page.js — the statistics lab, S1–S6 (spec §6.6, note 07). One
   experiment at a time, chosen by ?exp=. Each reads top to bottom: the
   question, how the experiment works, its parameters (N, seed) explained, the
   result in one sentence, then the evidence — tables and plots with the
   theoretical value next to the measured one. Heavy work runs in a Web
   Worker (js/core/lab/*.js); the frame is lab-panel.js. */

import { el, fmt } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { load, save } from '../../../assets/js/ui/store.js';
import {
  wilson, meanCI, median, binomialPmf, geometricCdf, geometricMedian, criticalZ, bonferroni, ruleOfThree,
} from '../../../assets/js/core/stats.js';
import { WORDS_CHANGED } from '../core/lab/s2.js';
import { facts, humanTime } from './widgets.js';
import { labPanel, MEASURED, THEORY, pf, pct, table, chart, verdict, section, flow, histogram } from './lab-panel.js';
import { hw02Shell } from './shell.js';

/* ---------- S1 · entropy pipe ---------- */

function s1(params, update) {
  const ent = params.words === 24 ? 256 : 128, cs = ent / 32;
  const H = Math.min(params.source, ent);
  const stages = [
    ['entropy', ent, ent, 'the generated secret'],
    ['mnemonic', ent + cs, ent + cs, `${ent} bits + ${cs} checksum bits (redundant)`],
    ['seed', 512, 512, 'PBKDF2 output'],
    ['master key + chain code', 512, 512, '256 + 256 bits'],
    ['private key k', 256, 256, 'one node of the tree'],
    ['public key Q = (x, y)', 512, 257, 'x plus the sign of y: ≈ 257 bits of information'],
    ['address', 160, 160, 'last 20 bytes of Keccak-256'],
    ['EIP-55 address', 160, 160, 'plus ≈ 15 check bits in the letter case'],
  ];
  return labPanel({
    exp: 's1', id: 'S1', title: 'S1 · The entropy pipe', cats: ['generation'],
    question: 'How much <em>secret</em> does each value of the pipeline really contain?',
    steps: [
      'Take the size in bits of every value the pipeline produces, from the entropy to the address.',
      'Its secret content cannot exceed what the generator produced: every later step is a deterministic function, and a function cannot add unpredictability, <span class="eq">H(f(X)) ≤ H(X)</span>.',
      'So the secret at each stage is the smaller of the two numbers. Compare the two bars.',
    ],
    fields: [
      { key: 'words', label: 'words', options: [[12, '12 (128 bits)'], [24, '24 (256 bits)']], hint: '12 words carry 128 bits of entropy, 24 words carry 256.' },
      { key: 'source', label: 'entropy of the source, bits', min: 1, max: 256, hint: 'how much real unpredictability the generator delivered. Lower it to model a weak generator: 32 for Milk Sad, about 40 for the Coldcard Mk2/Mk3.' },
    ],
    params, update,
    compute: () => stages.map(([stage, size, info]) => ({ stage, size, information: info, secret: Math.min(H, size) })),
    view: (rows) => ({
      answer: H < ent
        ? { ok: false, text: `Every value still <em>looks</em> ${ent}–512 bits long, but each carries only <strong>${H} bits</strong> of secret: an attacker needs at most 2^${H} guesses, not 2^${ent}.` }
        : { text: `Values grow to 512 bits and shrink to 160, but none carries more than <strong>${H} bits</strong> of secret — the amount the generator produced.` },
      body: [
        ...section(1, 'Size versus secret, stage by stage', 'Orange: how many bits the value occupies. Green: how many of those bits are secret.'),
        chart({
          categories: rows.map((r, i) => i + 1),
          series: [{ label: 'size of the value (bits)', color: THEORY, values: rows.map((r) => r.size) },
            { label: 'secret entropy (bits)', color: MEASURED, values: rows.map((r) => r.secret) }],
          xTitle: 'stage (numbered as in the table)', yTitle: 'bits',
        }),
        table(['stage', 'size (bits)', 'information (bits)', 'secret entropy (bits)', 'note'],
          rows.map((r, i) => [`${i + 1}. ${r.stage}`, String(r.size), String(r.information), String(r.secret), stages[i][3]])),
      ],
      rows,
    }),
    why: 'it separates the size of a value from the amount of secret in it — the distinction every later experiment depends on.',
    notes: [
      'The public key has 512 bits but only about 257 bits of information: given <span class="eq">x</span>, <span class="eq">y</span> is fixed up to its sign. The address is a compression of it; the wallet’s security stays at 128 bits, set by the entropy (and, separately, by the discrete logarithm).',
      'Lowering the source entropy changes nothing you can see in the values — and, as S5 shows, nothing a statistical test can see either.',
    ],
  });
}

/* ---------- S2 · avalanche ---------- */

function s2(params, update) {
  return labPanel({
    exp: 's2', id: 'S2', title: 'S2 · Avalanche through the pipeline', cats: ['derivation', 'hashing'],
    question: 'If a single bit of the entropy changes, how much of everything after it changes?',
    steps: [
      'Draw a random 128-bit entropy, and a copy with one random bit flipped.',
      'Run both through the whole pipeline: words, seed, master key, path <span class="eq">m/44’/60’/0’/0/0</span>, key, address.',
      'Count the words and the bits that differ at each stage. Repeat N times.',
      'Ideal behaviour: each stage acts like a fresh random function, so about half the bits change — <span class="eq">Binomial(size, ½)</span>.',
    ],
    fields: [
      { key: 'n', label: 'trials N', min: 10, max: 5000, hint: 'how many bit flips; more trials give narrower intervals and take longer.' },
      { key: 'seed', label: 'seed', min: 0, max: 4294967295 },
    ],
    params, update,
    view: ({ rows }) => {
      const N = rows.length;
      const stages = [['seed', 512], ['key', 256], ['address', 160]];
      const w = meanCI(rows.map((r) => r.words));
      const pw = WORDS_CHANGED, wTheory = pw[1] + 2 * pw[2], wSd = Math.sqrt(pw[1] + 4 * pw[2] - wTheory ** 2);
      const summary = [['words (of 12)', w, wTheory, wSd], ...stages.map(([k, size]) => [`${k} bits (of ${size})`, meanCI(rows.map((r) => r[k])), size / 2, Math.sqrt(size) / 2])];
      const outside = summary.filter(([, c, th]) => th < c.lo || th > c.hi).map(([name]) => name);
      const charts = stages.map(([k, size]) => {
        const sd = Math.sqrt(size) / 2, lo = Math.floor(size / 2 - 4 * sd), hi = Math.ceil(size / 2 + 4 * sd);
        const h = histogram(rows.map((r) => r[k]), lo, hi, size > 300 ? 3 : 2, (v) => binomialPmf(size, v, 0.5));
        return el('div', {}, [el('h3', { text: `${k}: bits changed of ${size}` }), chart({
          categories: h.labels, series: [{ label: 'measured', color: MEASURED, values: h.counts }],
          overlay: { label: `Binomial(${size}, ½) × N`, color: THEORY, values: h.theory }, xTitle: 'bits changed', yTitle: 'trials',
        })]);
      });
      const wordCounts = [0, 1, 2, 3].map((c) => rows.filter((r) => r.words === c).length);
      const mean = (k) => summary.find(([n]) => n.startsWith(k))[1].mean.toFixed(1);
      return {
        answer: outside.length === 0
          ? { text: `Yes, about half: on average <strong>${mean('seed')} of 512</strong> seed bits, <strong>${mean('key')} of 256</strong> key bits and <strong>${mean('address')} of 160</strong> address bits changed, and ${w.mean.toFixed(2)} words of 12. Every theoretical value lies inside its 95 % interval.` }
          : { ok: false, text: `Mostly: ${outside.join(', ')} fell outside its 95 % interval. With four intervals, one miss is expected about one run in five — run a new seed before concluding anything.` },
        body: [
          ...section(1, 'Averages against theory', 'Each row: the mean over N trials, its 95 % confidence interval, and the value a perfect random function would give.'),
          table(['stage', 'measured mean', '95 % interval', 'theory', 'measured sd', 'theory sd'],
            summary.map(([name, c, th, sd]) => [name, c.mean.toFixed(3), `[${c.lo.toFixed(2)}, ${c.hi.toFixed(2)}]`, th.toFixed(3), c.sd.toFixed(2), sd.toFixed(2)])),
          ...section(2, 'The whole distributions', 'Bars: how many trials changed that many bits. Line: the Binomial law. Bars hugging the line mean the stage behaves like a random function.'),
          el('div', { class: 'charts' }, [
            el('div', {}, [el('h3', { text: 'words changed (of 12)' }), chart({
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
      'The words behave differently from the bits: a flipped bit changes its own word and, in 15 cases out of 16, the 4 checksum bits in the last word. Exact law: one word with probability 7/128 + (121/128)(1/16), two with probability (121/128)(15/16); mean 1.886.',
      'Contrast with <span class="eq">k ↦ kG</span> alone: changing <span class="eq">k</span> to <span class="eq">k + 1</span> changes <span class="eq">Q</span> “a lot” but predictably (<span class="eq">Q + G</span>). Avalanche is a property of the hash-based steps, not of the curve.',
    ],
  });
}

/* ---------- S3 / S5a · tests on addresses ---------- */

const FAMILY = 4;   // the four headline tests, corrected together

function testRows(t) {
  const line = (name, stat, p) => [name, stat, pf(p), pf(bonferroni(p, FAMILY)), verdict(bonferroni(p, FAMILY) >= 0.05, 'nothing found', 'flagged')];
  return [
    line('hex digits equally frequent? (χ², 16 categories)', `${t.hex.stat.toFixed(2)}, df ${t.hex.df}`, t.hex.p),
    line('bytes equally frequent? (χ², 256 categories)', `${t.bytes.stat.toFixed(1)}, df ${t.bytes.df}`, t.bytes.p),
    line('half the bits are ones? (monobit)', `share ${t.monobit.proportion.toFixed(5)}, z = ${t.monobit.z.toFixed(2)}`, t.monobit.p),
    line('every bit position fair? (largest of 160 z-tests; p already × 160)', `|z| = ${Math.abs(t.positions.maxZ).toFixed(2)} at bit ${t.positions.maxAt}`, t.positions.pBonferroni),
  ];
}
const testsTable = (t) => table(['test', 'statistic', 'p', `p × ${FAMILY} (Bonferroni)`, 'verdict at 5 %'], testRows(t));
const correctedPs = (t) => [t.hex.p, t.bytes.p, t.monobit.p, t.positions.pBonferroni].map((p) => bonferroni(p, FAMILY));

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
    question: 'Do Ethereum addresses look like uniformly random 160-bit strings?',
    steps: [
      'Make N addresses from N random private keys.',
      'Run four tests on them: are the 16 hex digits equally frequent, are the 256 byte values, are half the bits ones, and is each of the 160 bit positions fair on its own?',
      'Correct for the number of tests (Bonferroni): with 164 tests per run, a few “significant” results at 5 % are expected by pure chance.',
      'Replicate with new seeds: a real bias comes back, a fluke does not.',
    ],
    fields: [
      { key: 'n', label: 'addresses N', min: 100, max: 60000, hint: 'how many addresses are generated and tested.' },
      { key: 'seed', label: 'seed', min: 0, max: 4294967295 },
    ],
    params, update,
    view: ({ tests: t, sample }) => {
      const crit = criticalZ(0.05, 160);
      const flagged = correctedPs(t).filter((p) => p < 0.05).length;
      // every completed run is a replication row, kept in this browser
      const rows = load(REPLICATIONS, []);
      if (!rows.some((r) => r.seed === params.seed && r.n === params.n)) {
        rows.push({ seed: params.seed, n: params.n, hexP: t.hex.p, byteP: t.bytes.p, monobitZ: t.monobit.z, maxZ: t.positions.maxZ, at: t.positions.maxAt, bonferroni: t.positions.pBonferroni });
        save(REPLICATIONS, rows);
      }
      const replicate = () => update({ seed: String(globalThis.crypto.getRandomValues(new Uint32Array(1))[0]) });
      return {
        answer: flagged === 0
          ? { text: `Yes: once the number of tests is taken into account, <strong>none of the four tests finds anything</strong> (smallest corrected p = ${pf(Math.min(...correctedPs(t)))}). A raw p below 0.05 here and there is the expected noise of running many tests.` }
          : { ok: false, text: `${flagged} test${flagged > 1 ? 's' : ''} flagged after correction. Before believing it, press <em>Replicate</em>: chance results move from run to run, a real bias stays.` },
        body: [
          ...section(1, 'The four tests', 'A small p means “unlikely if the addresses were uniform”. The Bonferroni column multiplies p by the number of tests; only that column decides the verdict.'),
          testsTable(t),
          ...section(2, 'Where the deviations are', 'Left: how far each hex digit is from its expected count, in standard deviations. Right: the same for each of the 160 bit positions; only a bar beyond the dashed lines would be significant after correction.'),
          el('div', { class: 'charts' }, [
            el('div', {}, [el('h3', { text: 'hex digits (Σ residual² = χ²)' }), hexChart(t)]),
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
          ...section(3, 'Replications in this browser', 'Every run you make is added here. Watch the “anomalies” move from test to test and bit to bit.'),
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
      'At the 5 % level about one test in twenty is “significant” by chance alone, so a single small p-value means nothing. Note 07 reports a monobit deviation that even replicated once before vanishing in larger samples; the cure was more data and a direct test of Keccak.',
      'What these tests can show is a <em>distribution</em>. They cannot show where the keys came from: S5(a) feeds them keys from a 16-bit seed and they pass just the same.',
    ],
  });
}

/* ---------- S4 · checksum detection ---------- */

function s4(params, update) {
  return labPanel({
    exp: 's4', id: 'S4', title: 'S4 · How often do the checksums miss?', cats: ['encoding', 'checksum'],
    question: 'How often does a mistake slip past the BIP-39 and EIP-55 checksums?',
    steps: [
      'BIP-39: make random phrases, replace one word of a valid phrase, or swap two neighbouring words — and check whether the checksum still says “valid”.',
      'EIP-55: take a random address in its checksummed form, mistype one character, and check whether it is still accepted.',
      'Count the misses and compare with theory: 1/16 for 12 words, 1/256 for 24, about 1 in 4 000 for EIP-55. Each rate gets a Wilson 95 % interval.',
    ],
    fields: [
      { key: 'n', label: 'BIP-39 trials N', min: 1000, max: 1000000, hint: 'trials for each of the four BIP-39 tests.' },
      { key: 'm', label: 'EIP-55 trials', min: 1000, max: 1000000, hint: 'mistyped addresses. Misses are rare — about 25 per 100 000 — so this number sets the precision.' },
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
      const misses = rows.filter((r) => !r.inside).length;
      const eip = rows.at(-1);
      return {
        answer: misses === 0
          ? { text: `As theory says: BIP-39 lets about <strong>1 error in 16</strong> through with 12 words (1 in 256 with 24), EIP-55 about <strong>1 in ${fmt(Math.round(1 / Math.max(eip.estimate, 1e-9)))}</strong> (theory 1 in 4 050). All five theoretical values are inside their 95 % intervals.` }
          : { ok: false, text: `${misses} of the five rates missed its interval — expected now and then at 95 %; rerun with a new seed.` },
        body: [
          ...section(1, 'Measured miss rates against theory', 'k / N: errors that passed out of errors tried. The Wilson interval is where the true rate lies with 95 % confidence; the last column checks theory against it.'),
          table(['event', 'k / N', 'estimate', 'Wilson 95 %', 'theory', 'theory inside?'],
            rows.map((r) => [r.test, `${fmt(r.k)} / ${fmt(r.n)}`, pct(r.estimate), `[${pct(r.lo)}, ${pct(r.hi)}]`, pct(r.theory), verdict(r.inside, 'yes', 'no')])),
          eip.k === 0 ? el('p', { class: 'small muted', text: `No EIP-55 miss observed: the rule of three bounds the rate at ${pct(ruleOfThree(eip.n))}.` }) : null,
          ...section(2, 'Why EIP-55 is weaker for some addresses', 'Each letter of an address is one check bit. Left: how many letters addresses have. Right: the miss rate by letter count — the fewer letters, the more typos slip through.'),
          el('div', { class: 'charts' }, [
            el('div', {}, [el('h3', { text: 'letters per address' }), chart({
              categories: Ls, series: [{ label: 'measured', color: MEASURED, values: Ls.map((L) => letters[L]) }],
              overlay: { label: 'Binomial(40, 6/16) × N', color: THEORY, values: Ls.map((L) => M * binomialPmf(40, L, 6 / 16)) }, xTitle: 'letters L = check bits', yTitle: 'addresses',
            })]),
            el('div', {}, [el('h3', { text: 'EIP-55 misses by letter count' }), table(['letters L', 'typos', 'missed', 'rate', 'theory 2^−L'],
              Ls.filter((L) => byLetters[L].trials >= 200).map((L) => [String(L), fmt(byLetters[L].trials), String(byLetters[L].missed), pct(byLetters[L].missed / byLetters[L].trials, 2), pct(2 ** -L, 2)]))]),
          ]),
        ],
        rows,
      };
    },
    why: 'a checksum is only as good as its measured miss rate — and EIP-55’s depends on the address.',
    notes: [
      'BIP-39: 4 checksum bits for 12 words, 8 for 24. Any change re-rolls the checksum (it is a hash), so an error passes when the 4 (or 8) bits happen to match: 1/16 (or 1/256).',
      'EIP-55: a typo passes with probability <span class="eq">2^−L</span> for an address with L letters, <span class="eq">(13/16)⁴⁰ ≈ 0.0247 %</span> on average. For rare events the simulation is coarse — 100 000 trials see only about 25 misses — while the formula is exact.',
    ],
  });
}

/* ---------- S5 · weak entropy ---------- */

function s5a(params, update) {
  return labPanel({
    exp: 's5a', id: 'S5a', title: 'S5(a) · Weak keys pass the tests', cats: ['generation'],
    question: `Would statistical tests notice that the keys came from a tiny ${params.bits}-bit seed?`,
    steps: [
      `Draw seeds of only ${params.bits} bits — ${fmt(2 ** params.bits)} possibilities in all.`,
      'Stretch each seed into a 256-bit private key with SHA-256, and compute its address. This is a scaled-down copy of real wallet bugs (Profanity, Milk Sad, Trust Wallet).',
      'Run exactly the same four tests as S3 on these addresses.',
    ],
    fields: [
      { key: 'bits', label: 'seed bits b', min: 4, max: 24, hint: 'size of the weak seed: only 2^b different keys can ever come out.' },
      { key: 'n', label: 'addresses N', min: 100, max: 60000, hint: 'how many addresses are tested.' },
      { key: 'seed', label: 'seed', min: 0, max: 4294967295 },
    ],
    params, update,
    view: ({ tests: t, distinctSeeds, space }) => {
      const flagged = correctedPs(t).filter((p) => p < 0.05).length;
      return {
        answer: flagged === 0
          ? { ok: false, text: `<strong>No.</strong> The tests find nothing (smallest corrected p = ${pf(Math.min(...correctedPs(t)))}), yet only <strong>${fmt(space)}</strong> keys are possible instead of 2¹²⁸. S5(b) breaks them in seconds.` }
          : { ok: false, text: `One test is flagged — at the rate expected by chance (compare S3). Nothing in it points to the real problem: only ${fmt(space)} keys are possible.` },
        body: [
          ...section(1, 'The size of the key space', 'What the attacker would enumerate.'),
          facts([
            ['possible keys from this generator', `2^${params.bits} = ${fmt(space)}`],
            ['possible keys for a 12-word wallet', '2^128 ≈ 3.4·10³⁸'],
            ['distinct seeds among these addresses', fmt(distinctSeeds)],
          ]),
          ...section(2, 'The same tests as S3', 'Read the verdict column: the addresses look exactly as uniform as real ones.'),
          testsTable(t),
          el('div', { class: 'charts' }, [el('div', {}, [el('h3', { text: 'hex digits (Σ residual² = χ²)' }), hexChart(t)])]),
        ],
        summary: { tests: testRows(t).map((r) => r.slice(0, 4)), distinctSeeds, space },
      };
    },
    why: 'statistical tests see the output distribution, not the input space — they cannot certify entropy.',
    notes: [
      'Each address is a hash of a curve point, so it looks exactly as uniform as a real one. The weakness is the small number of possible inputs, which only knowledge of the generator — or an enumeration that succeeds — reveals. That is why NIST SP 800-90B assesses the noise source, not the output.',
    ],
  });
}

function s5b(params, update) {
  return labPanel({
    exp: 's5b', id: 'S5b', title: 'S5(b) · The same weak keys, brute-forced', cats: ['generation'],
    question: `How long does it take to steal a key made from a ${params.bits}-bit seed?`,
    steps: [
      'Pick a victim seed at random and publish only its address — what a blockchain shows.',
      'The attacker knows the generator but not the seed: it tries seeds 0, 1, 2, …, computes each address, and stops at the match.',
      'Scale the measured speed to real key spaces.',
    ],
    fields: [
      { key: 'bits', label: 'seed bits b', min: 4, max: 22, hint: 'size of the key space searched: 2^b seeds, half of them on average.' },
      { key: 'seed', label: 'seed', min: 0, max: 4294967295 },
    ],
    params, update,
    view: (r) => {
      const gpu = 1e9;
      const spaces = [[`2^${params.bits} (this run)`, r.space], ['2^32 (Milk Sad, Trust Wallet)', 2 ** 32], ['2^40 (reported Coldcard Mk2/Mk3)', 2 ** 40], ['2^128 (a 12-word wallet)', 2 ** 128]];
      return {
        answer: { ok: false, text: `The key was found after <strong>${fmt(r.tried)} guesses</strong> in <strong>${humanTime(r.ms / 1000)}</strong>. A 32-bit generator falls in about ${humanTime(2 ** 31 / gpu)} on a GPU; a 128-bit one, never.` },
        body: [
          ...section(1, 'The search'),
          facts([
            ['victim’s address (public)', `0x${r.target}`],
            ['victim’s seed (secret) / seed found', `${r.victim} / ${r.found}`],
            ['guesses', fmt(r.tried)],
            ['time in this Web Worker', humanTime(r.ms / 1000)],
            ['speed (SHA-256 + kG + Keccak per guess)', `${fmt(Math.round(r.rate))} keys/s`],
          ]),
          ...section(2, 'The same search, scaled', 'Expected time to search half of each key space, at this browser’s speed and at a GPU-class 10⁹ keys per second.'),
          table(['key space', 'expected guesses (half)', 'this browser', 'GPU, 10⁹ keys/s'],
            spaces.map(([label, s]) => [label, s < 1e12 ? fmt(s / 2) : (s / 2).toExponential(1), humanTime(s / 2 / r.rate), humanTime(s / 2 / gpu)])),
        ],
        rows: [{ bits: params.bits, victim: r.victim, found: r.found, tried: r.tried, ms: Math.round(r.ms), rate: Math.round(r.rate) }],
      };
    },
    why: 'it turns S5(a)’s invisible weakness into a stolen key.',
    notes: [
      'The real attacks on 32-bit generators used GPUs and swept thousands of wallets. The last row is the point of the whole pipeline: with 128 bits of entropy the same search outlasts the universe, and nothing after the generator changes that number in either direction.',
    ],
  });
}

function s5c(params, update) {
  const range = 2 ** params.timer;
  return labPanel({
    exp: 's5c', id: 'S5c', title: 'S5(c) · The Coldcard model', cats: ['generation'],
    question: 'From 2021 to 2026 a hardware wallet made its seeds from a guessable generator. Would a statistical test have noticed — and how hard were the seeds to guess?',
    steps: [
      'Rebuild the faulty generator (diagram below): its only unknown input is the value of a timer when the seed was made.',
      'Make thousands of seeds with it and run the byte and bit tests — before and after the final hash.',
      `Create a victim wallet with a random timer value, then play the attacker: try every timer value 0 … ${fmt(range - 1)}, rebuild the 24 words, derive the public key, and compare with the victim’s.`,
    ],
    fields: [
      { key: 'timer', label: 'timer range, bits', min: 4, max: 17, hint: `the attacker tries 2^bits timer values (now ${fmt(range)}). The real device had about 80 000 ≈ 2^16.3; the default is smaller so a run takes seconds, not minutes.` },
      { key: 'n', label: 'seeds for the tests N', min: 100, max: 20000, hint: 'how many seeds the statistical tests (section 2) look at.' },
      { key: 'seed', label: 'seed', min: 0, max: 4294967295 },
    ],
    params, update,
    view: (r) => {
      const real = 80000, gpu = 1e6;
      const pass = (s) => s.bytes.p >= 0.05 && s.monobit.p >= 0.05;
      const row = (label, s) => [label, `${s.bytes.stat.toFixed(1)}, df 255`, pf(s.bytes.p), s.monobit.proportion.toFixed(4), verdict(pass(s), 'looks random', 'flagged')];
      return {
        answer: {
          ok: false,
          text: `The seeds <strong>pass every test</strong> (byte χ² p = ${pf(r.stats.raw.bytes.p)} raw, ${pf(r.stats.hashed.bytes.p)} hashed), yet the attacker recovered the victim’s 24 words after <strong>${fmt(r.tried)} guesses</strong>, in ${humanTime(r.ms / 1000)}. On the real device, with about 80 000 timer values, a GPU needs well under a second.`,
        },
        body: [
          ...section(1, 'How the device made a seed', 'The red box is the only thing an attacker does not know. Everything else is fixed: the chip-ID word is partly public (it leaks through the USB serial number), the second generator starts from constants printed in the source code, and the rest is deterministic.'),
          flow([
            ['chip-ID word', `0x${r.uid.toString(16).padStart(8, '0')}, known`, 'public'], '⊕', ['timer value', '≈ 80 000 possibilities', 'secret'],
            '→', ['Yasmarang PRNG #1', 'MicroPython fallback'], '⊕', ['Yasmarang PRNG #2', 'libngu, public constants', 'public'],
            '→', ['32 bytes'], '→', ['SHA-256d'], '→', ['24 words'],
          ]),
          el('p', { class: 'caption', text: 'Intended: 256 bits from the chip’s hardware random-number generator. Delivered: about 16 bits — the timer — once the chip-ID word is known.' }),
          ...section(2, 'What a statistical test sees', `${fmt(r.n)} seeds from the generator, tested as bytes (χ², 256 categories) and as bits (share of ones). A small p would mean “not random-looking”.`),
          table(['output tested', 'byte χ²', 'p', 'share of ones (ideal 0.5)', 'verdict'], [
            row('raw generator output (before the hash)', r.stats.raw),
            row('after SHA-256d (what became the 24 words)', r.stats.hashed),
          ]),
          el('p', { class: 'caption', style: 'margin-top:8px', text: 'Both pass — even before the hash. The generator mixes its state well; its only weakness is that the state is tiny and guessable, which no test on the output can measure.' }),
          ...section(3, 'What an attacker does', `The victim’s wallet was made with timer value <strong>${r.timer}</strong>, which the attacker does not know. The blockchain shows only the victim’s public key. For each guess the attacker rebuilds the 24 words, runs PBKDF2 and BIP-32 to <span class="eq">${r.path}</span> (the Bitcoin path the real attacks targeted), and compares public keys.`),
          facts([
            ['timer values the attacker tries', `0 … ${fmt(r.range - 1)}`],
            ['guesses until the match', `${fmt(r.tried)} (the match is timer = ${r.found})`],
            ['time, in this browser', humanTime(r.ms / 1000)],
            ['speed', `${r.rate.toFixed(0)} guesses/s — each one a full PBKDF2 + BIP-32 + kG`],
          ]),
          r.words ? el('div', { class: 'answer', style: 'margin-top:12px' }, [
            el('div', { class: 'label', text: 'The victim’s 24 words, recovered' }),
            el('p', { class: 'hex', style: 'border:0;padding:0;background:none;word-break:normal', text: r.words.join(' ') }),
          ]) : null,
          ...section(4, 'Scaled to the real device', 'The same search over the real number of timer values, and over every possible 32-bit starting state, at this browser’s speed and at a GPU-class 10⁶ PBKDF2 per second.'),
          table(['what is searched', 'this browser', 'GPU, 10⁶ guesses/s'], [
            [`the real timer range, ≈ ${fmt(real)} values`, humanTime(real / r.rate), humanTime(real / gpu)],
            ['all 2^32 starting states (chip-ID unknown too)', humanTime(2 ** 32 / r.rate), humanTime(2 ** 32 / gpu)],
          ]),
        ],
        rows: [{ timerBits: params.timer, timer: r.timer, found: r.found, tried: r.tried, ms: Math.round(r.ms), rawByteP: r.stats.raw.bytes.p, hashedByteP: r.stats.hashed.bytes.p }],
      };
    },
    why: 'a real hardware wallet produced valid, random-looking, guessable seeds for five years; this is its generator, in miniature.',
    notes: [
      'What went wrong, in one line: libngu guarded its hardware random-number generator with <span class="eq">#ifndef MICROPY_HW_ENABLE_RNG</span> (“is it undefined?”) where it meant <span class="eq">#if !MICROPY_HW_ENABLE_RNG</span> (“is it zero?”). MicroPython defines the macro as 0, so the guard never fired, and the linker silently picked MicroPython’s fallback generator — Yasmarang, seeded from the chip ID and a timer. The full story, with the code, is note 09.',
      'XORing a second Yasmarang copy that starts from public constants adds nothing: two deterministic streams XORed are still deterministic. Hashing with SHA-256d makes the output look perfect but cannot add entropy, <span class="eq">H(f(X)) ≤ H(X)</span>.',
      'The model is simplified as in note 09 §6: Mk2/Mk3 path, real-time-clock registers at 0, no earlier draws from the generator, no secure-element reseed (Mk4 and later added at most 32 bits that way). The attack has exactly the real shape: enumerate states, derive, compare with public keys on the blockchain, sweep. Users who had added 50 or more dice rolls were safe.',
    ],
  });
}

/* ---------- S6 · waiting times ---------- */

function s6(params, update) {
  const p = 16 ** -params.k;
  return labPanel({
    exp: 's6', id: 'S6', title: 'S6 · Vanity and look-alike addresses: waiting times', cats: ['hashing'],
    question: `How many tries does it take to get an address that starts with ${params.k} chosen hex character${params.k > 1 ? 's' : ''}?`,
    steps: [
      `Pick ${params.k} target hex character${params.k > 1 ? 's' : ''} at random.`,
      'Hash fresh inputs with Keccak-256 until the address (the last 20 bytes) starts with them; count the tries. Repeat for many searches.',
      `Compare with the geometric law: each try succeeds with probability 16^−${params.k}, so the mean is ${fmt(16 ** params.k)} tries and the median about 30 % lower.`,
    ],
    fields: [
      { key: 'k', label: 'matched characters k', min: 1, max: 5, hint: 'each extra character multiplies the work by 16.' },
      { key: 'runs', label: 'searches', min: 10, max: 20000, hint: 'independent searches; more give a smoother histogram.' },
      { key: 'seed', label: 'seed', min: 0, max: 4294967295 },
    ],
    params, update,
    view: ({ tries }) => {
      const c = meanCI(tries), q = [...tries].sort((a, b) => a - b)[Math.floor(0.98 * (tries.length - 1))];
      const width = Math.max(1, Math.ceil(q / 30));
      const bins = Math.ceil(q / width);
      const counts = new Array(bins).fill(0);
      for (const t of tries) if (t <= bins * width) counts[Math.floor((t - 1) / width)]++;
      const theory = counts.map((_, b) => tries.length * (geometricCdf((b + 1) * width, p) - geometricCdf(b * width, p)));
      const rate = 2e9, inside = c.lo <= 16 ** params.k && 16 ** params.k <= c.hi;
      return {
        answer: {
          ok: inside ? null : false,
          text: `On average <strong>${fmt(Math.round(c.mean))} tries</strong> (theory ${fmt(16 ** params.k)}${inside ? ', inside the 95 % interval' : ', outside the 95 % interval — rerun'}), median ${fmt(median(tries))} (theory ${fmt(geometricMedian(p))}). A look-alike matching an address’s first 4 and last 4 characters takes a GPU about ${humanTime(16 ** 8 / rate)}; all 40 characters, never.`,
        },
        body: [
          ...section(1, 'Measured against the geometric law'),
          table(['quantity', 'measured', 'theory'], [
            ['mean tries (95 % interval)', `${fmt(Math.round(c.mean))} [${fmt(Math.round(c.lo))}, ${fmt(Math.round(c.hi))}]`, fmt(16 ** params.k)],
            ['median tries', fmt(median(tries)), fmt(geometricMedian(p))],
            ['standard deviation', fmt(Math.round(c.sd)), fmt(Math.round(Math.sqrt(1 - p) / p))],
          ]),
          ...section(2, 'The distribution of the waiting time', 'Bars: how many searches needed that many tries. Line: the geometric law. Most searches end early; a few take several times the mean.'),
          chart({
            categories: counts.map((_, b) => b * width + 1), series: [{ label: 'searches', color: MEASURED, values: counts }],
            overlay: { label: 'Geometric × searches', color: THEORY, values: theory }, xTitle: 'tries until the match', yTitle: 'searches',
          }),
          ...section(3, 'Look-alike addresses, scaled', 'Expected time to match a number of characters at 2·10⁹ tries per second, a GPU-class figure.'),
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
      'The geometric law is memoryless and long-tailed: mean <span class="eq">1/p</span>, median <span class="eq">ln 2 / p</span>. Address poisoning exploits it: a look-alike that matches your first and last four characters, sent to you in a tiny transaction, hoping you copy it from your history. Checking all 40 characters costs the attacker <span class="eq">16⁴⁰ = 2¹⁶⁰</span>.',
      'Each try here hashes random input with Keccak-256; real vanity tools use public keys, which gives the same law.',
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
