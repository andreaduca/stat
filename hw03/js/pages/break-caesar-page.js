/* break-caesar-page.js — the Break Caesar page. The attack shown as its two
   steps: (1) decrypt with all 26 keys, (2) score each candidate with a
   recogniser — then what every recogniser concludes, how many letters theory
   says should suffice, the success-vs-length experiment (in a worker), and
   texts where the attack fails. The maths is in ../core/attack.js. */

import { el, explain, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { lineChart, chartLegend } from '../../../assets/js/ui/linechart.js';
import { runWorker } from '../../../assets/js/ui/worker.js';
import { encrypt, decrypt, normalise, ALPHABET } from '../core/caesar.js';
import { buildLanguage, toLetters, attack, rankOf, METHODS, METHOD, unigramTerms, ngramTerms, unicity, LENGTHS } from '../core/attack.js';
import { loadModel, loadQuadgrams } from '../core/data.js';
import { facts, chart } from './widgets.js';
import { hw03Shell, STICKY, MEMORY } from './shell.js';

const COLORS = { chi2: 'var(--m1)', loglik: 'var(--m2)', corr: 'var(--m3)', bigram: 'var(--m4)', quadgram: 'var(--m5)', top: 'var(--m6)' };
const pct = (x, d = 0) => `${(100 * x).toFixed(d)} %`;
const fmtScore = (m, v) => (m.id === 'corr' ? v.toFixed(4) : m.id === 'top' ? String(v) : v.toFixed(1));
const randomKey = () => { const b = new Uint8Array(1); do crypto.getRandomValues(b); while (b[0] >= 234); return b[0] % 26; };

/** First `n` characters on one line (the 26-row table stays one row per key). */
const oneLine = (t, n) => { const x = t.replace(/\s+/g, ' '); return x.length > n ? `${x.slice(0, n)}…` : x; };

/** The raw ciphertext cut just after its n-th letter (spaces and punctuation kept). */
function prefixWithLetters(text, n) {
  let seen = 0;
  for (let i = 0; i < text.length; i++) if (/[A-Za-z]/.test(text[i]) && ++seen === n) return text.slice(0, i + 1);
  return text;
}

/* ---------- input ---------- */

function inputCard(s, model, update, onLength) {
  const text = el('textarea', { id: 'in-ct', rows: 3, spellcheck: 'false' }, [s.ct]);
  const out = el('span', { class: 'eq' });
  const showN = (n) => { out.textContent = `${n} of ${s.N} letters`; };
  showN(s.n);
  const slider = el('input', {
    id: 'in-n', type: 'range', min: 1, max: Math.max(1, s.N), step: 1, value: String(s.n), 'aria-label': 'letters used',
    oninput: (e) => { const n = Number(e.target.value); showN(n); onLength(n); },
  });
  const make = (plain) => { const k = randomKey(); update({ ct: encrypt(plain, k), truek: k, n: null }); };
  return el('div', { class: 'card' }, [
    field('ciphertext to break (only the letters A–Z are used)', text),
    el('div', { class: 'row', style: 'margin-top:10px' }, [
      el('button', { class: 'primary', type: 'button', text: 'Break it', onclick: () => update({ ct: text.value, truek: null, n: null }) }),
      el('button', { type: 'button', text: 'Encrypt the shared message, random key', onclick: () => make(s.msg) }),
      el('button', { type: 'button', text: 'Encrypt the Frankenstein paragraph, random key', onclick: () => make(model.sample.text) }),
      el('div', { class: 'vrule' }),
      field('letters used', slider),
      out,
    ]),
    el('p', { class: 'small muted', style: 'margin:10px 0 0', html:
      (s.truek !== null ? `This ciphertext was made here with <strong>k = ${s.truek}</strong>, shown only so you can check the attack — the attack never looks at it. ` : 'Key unknown: a ciphertext you typed. ') +
      'Shorten the text with the slider and watch the attack lose its certainty, then fail.' }),
  ]);
}

/* ---------- 1. all 26 keys ---------- */

function keysPanel(s, L, view, redraw) {
  const m = METHOD[view.method];
  const res = attack(s.c, m, L);
  const lo = Math.min(...res.scores), hi = Math.max(...res.scores);
  const goodness = (v) => (hi === lo ? 1 : m.best === 'max' ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo));
  const keys = view.sort === 'score' ? res.order : [...Array(26).keys()];
  const tooShort = m.n && s.c.length < m.n;

  const chips = el('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'scoring method' }, METHODS.map((x) =>
    el('button', { type: 'button', role: 'radio', 'aria-checked': String(x.id === m.id), class: x.id === m.id ? 'on' : null, text: x.label,
      onclick: () => { view.method = x.id; view.pick = null; view.patch({ m: x.id }); redraw(); } })));
  const sort = el('div', { class: 'radio-row small' }, ['key', 'score'].map((o) => el('label', {}, [
    el('input', { type: 'radio', name: 'sort', checked: view.sort === o, onchange: () => { view.sort = o; view.patch({ sort: o === 'key' ? null : o }); redraw(); } }), `order by ${o}`])));

  const rows = keys.map((k) => {
    const isBest = res.ties.includes(k), isTrue = k === s.truek;
    return el('tr', {
      class: [isBest ? 'best' : '', k === view.pick ? 'picked' : ''].join(' ').trim() || null,
      tabindex: 0, title: 'show how this score is made', 'data-k': k,
      onclick: () => { view.pick = k; redraw(); },
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); view.pick = k; view.refocus = k; redraw(); } },
    }, [
      el('td', { text: String(k) }),
      el('td', { class: 'left cand', text: oneLine(decrypt(s.raw, k), 44) }),
      el('td', { class: 'left score' }, [el('span', { class: 'sbar' }, [el('i', { style: `width:${(100 * goodness(res.scores[k])).toFixed(1)}%` })]), fmtScore(m, res.scores[k])]),
      el('td', { text: String(rankOf(res, k)) }),
      el('td', { class: 'left' }, [isBest ? el('span', { class: 'flag best', text: res.ties.length > 1 ? 'tied best' : 'best' }) : null, isTrue ? el('span', { class: 'flag true', text: '✔ true key' }) : null]),
    ]);
  });

  return el('div', { class: 'card' }, [
    el('div', { class: 'step-head' }, [el('span', { class: 'step-no', text: '1' }), el('h2', { text: 'Try every key, score every result' })]),
    el('p', { class: 'small muted', text: 'The search is always the same: decrypt with all 26 keys. What changes is the recogniser — the score that says how much a decryption looks like English. Pick one:' }),
    chips,
    el('p', { class: 'formula', html: m.formula }),
    el('p', { class: 'small', text: m.idea }),
    tooShort ? el('p', { class: 'notice', text: `Only ${s.c.length} letter${s.c.length > 1 ? 's' : ''}: there is no group of ${m.n} letters to score, so every key gets 0 — the method has nothing to go on and can only guess.` }) : null,
    el('div', { class: 'row keys-head' }, [sort, el('span', { class: 'small muted', text: 'longer bar = more English-like · click a row to see its score taken apart' })]),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data keys' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'k' }), el('th', { class: 'left', text: 'decryption with this key' }), el('th', { class: 'left', text: `score (${m.short})` }), el('th', { text: 'rank' }), el('th', {})])]),
      el('tbody', {}, rows),
    ])]),
    explain([
      'Each row is one candidate key: the ciphertext shifted back by k, and the score it gets. The right key is not known to the attack; it simply keeps the row with the best score. Click a row to see, in step 2, where its score comes from.',
      'Six recognisers, from the crudest to the most detailed: the most frequent letter (one bar of the histogram), three ways of comparing the whole letter histogram with English (χ², likelihood, correlation), and the likelihood of letter pairs and of runs of four letters, which also see the <em>order</em> of the letters.',
    ]),
  ]);
}

/* ---------- 2. why this score ---------- */

function breakdownPanel(s, L, view) {
  const m = METHOD[view.method];
  const res = attack(s.c, m, L);
  const a = view.pick ?? res.best;
  const b = a === res.best ? res.order[1] : res.best;
  const side = (k, role) => el('div', { class: 'why-side' }, [
    el('h3', {}, [`k = ${k}`, el('span', { class: 'small muted', text: ` · ${role} · rank ${rankOf(res, k)} · score ${fmtScore(m, res.scores[k])}` })]),
    el('p', { class: 'cand-line', text: normalise(decrypt(s.raw, k)).slice(0, 60) || '—' }),
    m.n ? gramsView(s, k, m, L) : unigramView(s, k, m, L),
  ]);
  return el('div', { class: 'card' }, [
    el('div', { class: 'step-head' }, [el('span', { class: 'step-no', text: '2' }), el('h2', { text: 'Why a key scores what it scores' })]),
    el('p', { class: 'small muted', text: `The ${a === res.best ? 'winning key' : 'key you clicked'} next to ${a === res.best ? 'the runner-up' : 'the winner'}, taken apart term by term with the ${m.label} recogniser. Click any row in step 1 to compare another key.` }),
    el('div', { class: 'cols' }, [side(a, a === res.best ? 'best' : 'clicked'), side(b, b === res.best ? 'best' : 'runner-up')]),
    explain(m.n ? [
      `The score adds up ln p for every group of ${m.n} consecutive letters of the decryption, with p measured on the four training books. Dark tiles are common in English, pale ones rare; a red outline marks a group never seen in 2.5 million letters, which gets the floor value ln(0.01 / total) instead of −∞.`,
      'A wrong key turns English into strings like “QEB NRF”: almost every group is rare or unseen, so the sum collapses. The right key gives familiar groups (“THE”, “ING”, “TION”) and the largest total.',
    ] : m.id === 'top' ? [
      'This recogniser looks at one number only: how many E’s the decryption contains. It equals the count of the ciphertext letter that the key maps to E, so the winning key is “most frequent ciphertext letter minus 4”.',
      'It throws away the other 25 bars. On a short text the most frequent letter is often T, A or O rather than E, and then the guess is wrong — the experiment below measures how often.',
    ] : [
      'The bars are the decrypted text’s letter frequencies, the dots are English. The right key puts the tall bars on the tall dots; a wrong key puts them on rare letters such as Z, Q or J.',
      'The table lists the letters that weigh most in the score: for χ² the largest (O − E)²/E terms, for the likelihood the largest O·ln p contributions, for the correlation the largest q·p products.',
      'PRACTICE: χ² and the log-likelihood almost always agree: for long texts χ² ≈ G = −2 ln L + const, and since a shift only permutes the counts, minimising G is exactly maximising ln L (note §2.2).',
    ]),
  ]);
}

function unigramView(s, k, m, L) {
  const terms = unigramTerms(s.c, k, m.id, L);
  const n = s.c.length || 1;
  const key = (t) => (m.id === 'loglik' ? Math.abs(t.term) : t.term);
  const top = [...terms].filter((t) => t.O || m.id === 'chi2').sort((x, y) => key(y) - key(x)).slice(0, 5);
  return el('div', {}, [
    chart({
      categories: [...ALPHABET], series: [{ label: 'decryption', color: 'var(--s1)', values: terms.map((t) => (100 * t.O) / n) }],
      overlay: { label: 'English', color: 'var(--s2)', values: terms.map((t) => 100 * t.p), dots: true }, yTitle: '% of letters', height: 170,
    }),
    m.id === 'top' ? null : el('table', { class: 'data terms' }, [
      el('thead', {}, [el('tr', {}, ['letter', 'O seen', 'E expected', m.id === 'chi2' ? '(O−E)²/E' : m.id === 'loglik' ? 'O·ln p' : 'q·p'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, top.map((t) => el('tr', {}, [el('td', { text: t.letter }), el('td', { text: String(t.O) }), el('td', { text: t.E.toFixed(1) }), el('td', { text: m.id === 'corr' ? t.term.toFixed(4) : t.term.toFixed(1) })]))),
    ]),
  ]);
}

function gramsView(s, k, m, L) {
  const grams = ngramTerms(s.c, k, m.n, L);
  if (!grams.length) return el('p', { class: 'small muted', text: `No group of ${m.n} letters in a text this short.` });
  const shown = grams.slice(0, 48);
  const lo = L.floors[m.n], hi = -2;      // shade from the floor (unseen) to very common
  const unseen = grams.filter((g) => g.unseen).length;
  return el('div', {}, [
    el('div', { class: 'grams' }, shown.map((g) => el('span', {
      class: g.unseen ? 'unseen' : null, title: `${g.gram}: ln p = ${g.logp.toFixed(2)}${g.unseen ? ' (never seen: floor)' : ''}`,
      style: `--w:${Math.max(0.08, Math.min(1, (g.logp - lo) / (hi - lo))).toFixed(2)}`,
    }, [g.gram, el('small', { text: g.logp.toFixed(1) })]))),
    grams.length > shown.length ? el('p', { class: 'small muted', text: `… ${grams.length - shown.length} more` }) : null,
    facts([
      [`groups of ${m.n} letters`, String(grams.length)],
      ['never seen in the training books', `${unseen} (${pct(unseen / grams.length)})`],
      ['sum of ln p = the score', grams.reduce((a, g) => a + g.logp, 0).toFixed(1)],
    ]),
  ]);
}

/* ---------- 3. every method's verdict ---------- */

function verdictPanel(s, L) {
  const rows = METHODS.map((m) => {
    const r = attack(s.c, m, L);
    const tie = r.ties.length > 1;
    const conf = r.posterior ? r.posterior[r.best] : null;
    const p = (x) => (x > 0.9995 ? '> 99.9 %' : pct(x, 1));
    const word = tie ? `${r.ties.length}-way tie` : conf === null ? 'no probability model' : conf > 0.99 ? `clear (${p(conf)})` : conf > 0.9 ? `likely (${p(conf)})` : `close call (${p(conf)})`;
    const right = !tie && r.best === s.truek, coin = tie && r.ties.includes(s.truek);
    return el('tr', {}, [
      el('td', { class: 'left' }, [el('i', { class: 'swatch', style: `background:${COLORS[m.id]}` }), m.label]),
      el('td', { text: tie ? r.ties.join(', ') : String(r.best) }),
      el('td', { class: 'left cand', text: decrypt(s.raw, r.best).slice(0, 44) }),
      el('td', { class: 'left', text: word }),
      s.truek === null ? null : el('td', { class: right ? 'same' : coin ? 'muted' : 'diff', text: right ? '✔' : coin ? `coin flip (1 in ${r.ties.length})` : '✘' }),
    ]);
  });
  return el('div', { class: 'card' }, [
    el('div', { class: 'step-head' }, [el('span', { class: 'step-no', text: '3' }), el('h2', { text: 'What every recogniser concludes' })]),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data prose verdicts' }, [
      el('thead', {}, [el('tr', {}, ['recogniser', 'best k', 'its decryption', 'confidence', s.truek === null ? null : 'right?'].filter(Boolean).map((h, i) => el('th', { class: i === 1 || i === 4 ? null : 'left', text: h })))]),
      el('tbody', {}, rows),
    ])]),
    explain([
      'The confidence is the posterior probability of the winning key, P(k | ciphertext) = L(k) / Σ L(j), Bayes’ rule with all 26 keys equally likely beforehand. It exists only for the recognisers that are likelihoods (for χ², through ln L ≈ −χ²/2). Correlation and “top = E” are scores, not probabilities.',
      'The models are simplifications — letters are not independent — so the posteriors are overconfident in absolute terms. They are still a fair signal: “clear” means the runner-up is far behind, “close call” means a second key is almost as plausible and the answer should not be trusted.',
    ]),
  ]);
}

/* ---------- 4. unicity distance ---------- */

function unicityPanel(L) {
  const u = unicity(L.rates);
  const names = ['letter counts (χ², ln L, correlation)', 'bigrams', 'trigrams', 'quadgrams'];
  return el('div', { class: 'card' }, [
    el('h2', { text: 'How many letters should be enough?' }),
    el('p', { class: 'formula', html: 'U = H(K) / D, &nbsp;H(K) = log₂26 ≈ 4.70 bits, &nbsp;D = log₂26 − H<sub>model</sub> (redundancy per letter)' }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data prose' }, [
      el('thead', {}, [el('tr', {}, ['what the model sees', 'H, bits/letter', 'redundancy D', 'U, letters'].map((h, i) => el('th', { class: i ? null : 'left', text: h })))]),
      el('tbody', {}, u.map((r, i) => el('tr', {}, [el('td', { class: 'left', text: names[i] }), el('td', { text: r.H.toFixed(3) }), el('td', { text: r.D.toFixed(3) }), el('td', { text: r.U.toFixed(1) })]))),
    ])]),
    explain([
      'Shannon’s unicity distance: a key carries H(K) bits of uncertainty, and every ciphertext letter gives away D bits of it, the redundancy of the language. After about U = H(K)/D letters only one key is left that turns the ciphertext into plausible text.',
      'The redundancy depends on how much of the language the attacker’s model can see. Looking only at letter counts, English letters carry 4.17 bits of their 4.70: just 0.53 bits leak per letter, so about 9 letters are needed. Knowing the previous three letters cuts the uncertainty to 2.69 bits per letter, 2 bits leak, and about 2.3 letters suffice. All of these entropies are measured on the training books (plug-in estimates; the quadgram one is slightly low because 2.5 million letters cannot fill 457 000 cells).',
      'The experiment below checks this: the recognisers that use more of the language should need fewer letters.',
    ]),
  ]);
}

/* ---------- 5. the experiment ---------- */

const WORKER = new URL('../workers/experiment.js', import.meta.url);
const results = new Map();          // "T seed" -> {result, seconds} | {error}
let job = null;

function runExperiment(params, update) {
  const key = `${params.T} ${params.seed}`;
  if (job?.key === key) return;
  if (job) job.cancel();
  const running = { key, node: null, started: performance.now() };
  const handle = runWorker(WORKER, params, (v) => { if (running.node) running.node.value = v; });
  running.cancel = handle.cancel;
  job = running;
  handle.done
    .then((result) => results.set(key, { result, seconds: (performance.now() - running.started) / 1000 }))
    .catch((e) => { if (!e.cancelled) results.set(key, { error: e.message }); })
    .finally(() => { if (job === running) { job = null; update({}); } });
}

function experimentPanel(state, update, L, view, redraw) {
  const T = Math.min(5000, Math.max(50, Number.parseInt(state.T, 10) || 500));
  const seed = Math.max(0, Number.parseInt(state.seed, 10) || 1) >>> 0;
  const key = `${T} ${seed}`;
  const done = results.get(key);
  if (!done) runExperiment({ T, seed }, update);

  const tIn = el('input', { type: 'number', class: 'num', min: 50, max: 5000, step: 50, value: String(T) });
  const sIn = el('input', { type: 'number', class: 'num', min: 0, value: String(seed) });
  const head = [
    el('h2', { text: 'The experiment: success rate against text length' }),
    el('p', { class: 'question', text: 'How many ciphertext letters does each recogniser need to find the key, and how sure can we be of the measured rates?' }),
    el('div', { class: 'how' }, [el('div', { class: 'label', text: 'How the experiment works' }), el('ol', {}, [
      el('li', { html: `For each length L in ${LENGTHS.join(', ')} letters, and ${T} times over:` }),
      el('li', { html: 'cut a random excerpt of L letters from a <strong>test</strong> book (Frankenstein, Dracula — never used to build the model) and pick a key k uniformly from 0–25;' }),
      el('li', { html: 'encrypt, and let all six recognisers guess k from the ciphertext alone — the <strong>same</strong> excerpt and key for every recogniser (a paired design);' }),
      el('li', { html: 'success = the guess equals k. A tie for the best score is broken at random, so a method with nothing to go on scores 1/26 ≈ 4 %;' }),
      el('li', { html: `the success rate s/${T} gets a Wilson 95 % interval, drawn as the band around each line.` }),
    ])]),
    el('div', { class: 'row' }, [
      field('trials per length T', tIn), field('seed', sIn),
      el('button', { class: 'primary', type: 'button', text: 'Run', onclick: () => update({ T: tIn.value, seed: sIn.value }) }),
    ]),
    el('ul', { class: 'hints' }, [
      el('li', { html: '<strong>T</strong> — more trials, narrower bands: the half-width shrinks like 1/√T (about ±4 % at T = 500 near a 50 % rate).' }),
      el('li', { html: '<strong>seed</strong> — the seeded generator makes the run reproducible; a different seed gives a different sample of excerpts and keys.' }),
    ]),
  ];

  if (!done || done.error) {
    const bar = el('progress', { max: 1, value: 0, 'aria-label': 'experiment progress' });
    if (job) job.node = bar;
    return el('div', { class: 'card lab' }, [...head, done?.error
      ? el('p', { class: 'err', text: done.error })
      : el('div', { class: 'running' }, [el('span', { class: 'small muted', text: `Running ${LENGTHS.length} × ${T} trials × 6 recognisers…` }), bar])]);
  }

  const { result, seconds } = done;
  const by = Object.fromEntries(result.methods.map((m) => [m.id, m]));
  const shown = METHODS.filter((m) => !view.hidden.has(m.id));
  const series = shown.map((m) => ({
    label: m.short, color: COLORS[m.id],
    points: by[m.id].rows.map((r) => [r.len, r.rate]),
    band: by[m.id].rows.map((r) => [r.len, r.lo, r.hi]),
  }));
  const best = by.quadgram.need, uni = by.loglik.need, topE = by.top.rows.at(-1);
  const u = unicity(L.rates);

  const toggles = el('div', { class: 'chips' }, METHODS.map((m) => el('button', {
    type: 'button', 'aria-pressed': String(!view.hidden.has(m.id)), class: view.hidden.has(m.id) ? null : 'on',
    onclick: () => { if (view.hidden.has(m.id)) view.hidden.delete(m.id); else if (view.hidden.size < 5) view.hidden.add(m.id); redraw(); },
  }, [el('i', { class: 'swatch', style: `background:${COLORS[m.id]}` }), m.short])));

  const cell = (r) => el('td', { title: `${r.s}/${r.T}, 95 % CI ${pct(r.lo, 1)}–${pct(r.hi, 1)}` }, [
    el('span', { text: pct(r.rate) }), el('small', { class: 'muted', text: ` ${(100 * r.lo).toFixed(0)}–${(100 * r.hi).toFixed(0)}` })]);

  return el('div', { class: 'card lab' }, [
    ...head,
    el('div', { class: 'answer' }, [el('div', { class: 'label', text: 'Result' }), el('p', { html:
      `Quadgram scoring finds the key at least 95 % of the time from <strong>${best ?? '—'} letters</strong>; the letter-count likelihood needs <strong>${uni ?? '—'}</strong>; ` +
      `“most frequent letter = E” is still wrong ${pct(1 - topE.rate)} of the time at ${topE.len} letters. ` +
      `<span class="muted">(${result.lengths.length * T * 6} attacks in ${seconds.toFixed(1)} s, seed ${seed})</span>` })]),

    el('h3', { class: 'section' }, [el('span', { class: 'n', text: '1' }), 'Success rate against length']),
    el('p', { class: 'caption', text: 'One line per recogniser, the band is its 95 % interval; the length axis is logarithmic. The grey line is the 1/26 of a blind guess. Click a name to hide or show its line.' }),
    toggles,
    lineChart({
      series: [...series, { label: 'blind guess', color: 'var(--muted)', points: [[1, 1 / 26], [500, 1 / 26]] }],
      logX: true, xTicks: [1, 2, 3, 5, 10, 20, 50, 100, 200, 500], yMin: 0, yMax: 1, yTicks: [0, 0.25, 0.5, 0.75, 1],
      yFormat: (y) => `${y * 100} %`, xTitle: 'ciphertext letters (log scale)', yTitle: 'key found', endLabels: false, height: 280,
      tip: (x, vals) => `${x} letters\n${[...series.map((s) => s.label), 'blind guess'].map((l, i) => `${l}: ${pct(vals[i], 1)}`).join('\n')}`,
    }),
    chartLegend(series),

    el('h3', { class: 'section' }, [el('span', { class: 'n', text: '2' }), 'The numbers behind the lines']),
    el('p', { class: 'caption', text: `Success rate and its 95 % Wilson interval for every length (hover a cell for s/T).` }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data rates' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'L' }), ...METHODS.map((m) => el('th', {}, [el('i', { class: 'swatch', style: `background:${COLORS[m.id]}` }), m.short]))])]),
      el('tbody', {}, result.lengths.map((len, i) => el('tr', {}, [el('td', { text: String(len) }), ...METHODS.map((m) => cell(by[m.id].rows[i]))]))),
    ])]),

    el('h3', { class: 'section' }, [el('span', { class: 'n', text: '3' }), 'Measured against theory']),
    el('p', { class: 'caption', text: 'Letters needed for a success rate of at least 95 % (from that length on), next to the unicity distance of the model each recogniser uses.' }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data prose' }, [
      el('thead', {}, [el('tr', {}, ['recogniser', 'needs (measured)', 'unicity distance U', 'when wrong, median rank of the true key at 5 letters'].map((h, i) => el('th', { class: i ? null : 'left', text: h })))]),
      el('tbody', {}, METHODS.map((m) => {
        const order = m.n ?? 1, r5 = by[m.id].rows[result.lengths.indexOf(5)];
        return el('tr', {}, [
          el('td', { class: 'left' }, [el('i', { class: 'swatch', style: `background:${COLORS[m.id]}` }), m.label]),
          el('td', { text: by[m.id].need ? `${by[m.id].need} letters` : `> ${result.lengths.at(-1)}` }),
          el('td', { text: m.id === 'top' ? '—' : `${u[order - 1].U.toFixed(1)} letters` }),
          el('td', { text: r5?.medianFailRank ? String(r5.medianFailRank) : '—' }),
        ]);
      })),
    ])]),

    el('p', { class: 'why matters', html: 'the attack needs no known plaintext and no access to the encryption — only the ciphertext and a corpus of the language. Its single requirement is <em>enough letters</em>, and the recogniser decides how many “enough” is.' }),
    explain([
      'The unicity distance is a lower bound for an ideal attacker; real recognisers need a few times more, because U is an average and the success threshold here is a demanding 95 %. The ordering is the point: the more of the language a model captures, the fewer letters it needs — exactly as the redundancy D predicts.',
      'At 1 letter the unigram methods already beat a blind guess (≈ 12 % instead of 4 %): they bet that the letter is E, and about 12 % of English letters are. The n-gram methods cannot score a text shorter than their n and fall back to chance — the dip of the quadgram line at 2–3 letters.',
      'χ² and the log-likelihood nearly coincide, as the theory says (argmin G = argmax ln L, and χ² ≈ G). The log-likelihood is slightly better on short texts, where χ² is a poor approximation.',
      '“Most frequent letter = E” uses one bar out of 26 and converges painfully slowly. Exhaustive search with a good recogniser always beats a shortcut.',
    ]),
  ]);
}

/* ---------- 6. where it fails ---------- */

const CASES = [
  { name: 'Very short', text: 'Attack at dawn' },
  { name: 'No letter E', text: 'A man in a dark coat stood waiting for a train. His hands shook, his mind was on a past day, and a cold wind blew through his thin hair as night came down on that small town.' },
  { name: 'Names and codes', text: 'Kowalczyk Zbigniew, Xu Qiyang, Hjalmar Bjorkqvist, Szczepan Wozniak, Jozsef Vukovic, ZX81 QW9 JKV' },
  { name: 'Italian, scored as English', text: 'Nel mezzo del cammin di nostra vita mi ritrovai per una selva oscura, che la diritta via era smarrita.' },
  { name: 'Source code', text: 'for (int i = 0; i < n; i++) { x[i] = y[j] * z[k]; } return xyz;' },
];
const CASE_KEY = 11;

function failPanel(L, update) {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Where it fails' }),
    el('p', { class: 'small muted', text: `Each text is encrypted with k = ${CASE_KEY} and attacked by all six recognisers. ✔ = key found, ✘ = wrong key (the guess is shown).` }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data prose fails' }, [
      el('thead', {}, [el('tr', {}, [el('th', { class: 'left', text: 'text' }), el('th', { text: 'letters' }), ...METHODS.map((m) => el('th', {}, [el('i', { class: 'swatch', style: `background:${COLORS[m.id]}` }), m.short])), el('th', {})])]),
      el('tbody', {}, CASES.map((cs) => {
        const ct = encrypt(cs.text, CASE_KEY), c = toLetters(normalise(ct));
        return el('tr', {}, [
          el('td', { class: 'left' }, [el('strong', { text: cs.name }), el('div', { class: 'small muted', text: cs.text.length > 70 ? `${cs.text.slice(0, 70)}…` : cs.text })]),
          el('td', { text: String(c.length) }),
          ...METHODS.map((m) => { const r = attack(c, m, L); const hit = r.best === CASE_KEY && r.ties.length === 1; return el('td', { class: hit ? 'same' : 'diff', text: hit ? '✔' : `✘ ${r.ties.length > 1 ? 'tie' : r.best}` }); }),
          el('td', {}, [el('button', { type: 'button', text: 'attack it above', onclick: () => { update({ ct, truek: CASE_KEY, n: null }); window.scrollTo({ top: 0, behavior: 'smooth' }); } })]),
        ]);
      })),
    ])]),
    explain([
      'Every recogniser compares the decryption with a model of English, so it fails when the right decryption does not look like that model. How far from English a text must be depends on the recogniser — the table is computed live, and it is not what one might guess.',
      '<strong>Names and codes</strong> defeat all six: Polish and Swedish spelling and random codes (SZCZ, KQV, ZX81) look no more English under the right key than under a wrong one. <strong>Very short</strong> texts defeat the weaker recognisers. <strong>Source code</strong> is broken only by the quadgrams, which still find English fragments (“RETU”, “TURN”, “FOR”) among the symbols.',
      'The <strong>text without E</strong> (a lipogram) fools only the “top = E” shortcut: the other 25 letters still have an English shape, and the full-histogram methods use them. <strong>Italian</strong>, scored with the English model, is broken by every full recogniser: its letters are distributed differently (more A, I, O; almost no W, K, Y), but the right key is still the only one that gives natural-language statistics at all. The attack is robust, not exact — a different language or a skewed text costs it letters, not the key.',
      'Pre-processing matters too: the corpus and the ciphertexts must be normalised the same way (here: accents stripped, letters only). An attack that counted “è” differently in the two would be scoring against the wrong model.',
      'PRACTICE: All of these are limits of the <em>recogniser</em>, not of the search. With 26 keys a human reading the 26 candidates in step 1 would break every one of these texts instantly. The cipher itself offers no protection at all — only the amount of text and its typicality do.',
    ]),
  ]);
}

/* ---------- the page ---------- */

let language = null;
// what the reader is looking at; method and order also live in the URL
const view = { method: 'quadgram', sort: 'key', pick: null, refocus: null, hidden: new Set(), patch: () => {} };

startPage({
  shell: hw03Shell('break-caesar.html'),
  sticky: STICKY,
  memory: MEMORY,
  render: async ({ state, update, patch }) => {
    const model = await loadModel();
    language ??= buildLanguage(model, await loadQuadgrams());
    const L = language;
    view.method = METHOD[state.m] ? state.m : 'quadgram';
    view.sort = state.sort === 'score' ? 'score' : 'key';
    view.patch = patch;
    const msg = state.msg ?? 'ATTACK AT DAWN';
    const full = state.ct ?? encrypt(model.sample.text, 7);
    const truek = state.ct === undefined ? 7 : state.truek !== undefined && state.truek !== null && state.truek !== '' ? Number(state.truek) : null;
    const N = normalise(full).length;
    const n0 = Math.min(N, Math.max(1, Number.parseInt(state.n, 10) || N));

    const live = el('div');
    const exp = el('div');
    const drawLive = (n) => {
      const raw = prefixWithLetters(full, n);
      const s = { raw, c: toLetters(normalise(raw)), truek, msg };
      const redraw = () => drawLive(n);
      live.replaceChildren(keysPanel(s, L, view, redraw), breakdownPanel(s, L, view), verdictPanel(s, L));
      // a keyboard choice redraws the table: give the focus back to the row that was chosen
      if (view.refocus !== null) { live.querySelector(`table.keys tr[data-k="${view.refocus}"]`)?.focus(); view.refocus = null; }
    };
    const drawExp = () => exp.replaceChildren(experimentPanel(state, update, L, view, drawExp));
    drawLive(n0);
    drawExp();
    const s0 = { ct: full, N, n: n0, truek, msg };
    return [
      inputCard(s0, model, update, (n) => { patch({ n: n === N ? null : n }); view.pick = null; drawLive(n); }),
      live,
      unicityPanel(L),
      exp,
      failPanel(L, update),
    ];
  },
});
