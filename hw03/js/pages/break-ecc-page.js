/* break-ecc-page.js — the Break toy ECC page: what the attacker knows and why
   the test d′G = Q is exact, then three searches run live in workers on the
   key the Toy ECC page made (brute force, baby-step giant-step, kangaroo),
   each with a picture of how it moves through the key space; the message
   decrypted with the recovered key; the timing experiment; and the
   extrapolation to real key sizes. The maths is in ../core/ecdlp.js. */

import { el, explain, field, fmt } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { lineChart, chartLegend } from '../../../assets/js/ui/linechart.js';
import { runWorker } from '../../../assets/js/ui/worker.js';
import { mulG, compressedHex } from '../../../assets/js/core/secp256k1.js';
import { keygen, encrypt, decrypt } from '../core/elgamal.js';
import { METHODS, SIZES, REPS, expectedOps, rhoFullOps } from '../core/ecdlp.js';
import { facts, humanTime, humanBytes, pow2 } from './widgets.js';
import { clampBits, readKey } from './toykey.js';
import { hw03Shell, STICKY, MEMORY } from './shell.js';

const WORKER = new URL('../workers/ecdlp.js', import.meta.url);
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, text = null) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== null) n.textContent = text;
  return n;
};
const hx = (pt) => compressedHex(pt);
const short = (h, n = 10) => `${h.slice(0, n)}…`;
const COLOR = Object.fromEntries(METHODS.map((m) => [m.id, m.color]));
const LABEL = Object.fromEntries(METHODS.map((m) => [m.id, m.label]));
/* rough rates (additions/s), a little below what Chrome measured on the development
   machine; used only to decide whether a live run starts by itself (≤ AUTO
   seconds) or waits for a click, and to estimate how long it would take */
const GUESS_RATE = { brute: 500000, bsgs: 250000, kangaroo: 80000 };
const AUTO = 8;
const estimate = (id, bits) => expectedOps[id](bits) / GUESS_RATE[id];

/* ---------- jobs: live attacks and the experiment, cached across redraws ---------- */

const jobs = new Map();     // key -> {status: 'running'|'done'|'error', progress, result, error, cancel, nodes}

function start(key, message, update) {
  const job = { status: 'running', progress: null, nodes: new Set() };
  jobs.set(key, job);
  const handle = runWorker(WORKER, message, (p) => { job.progress = p; job.nodes.forEach((fn) => fn(p)); });
  job.stop = () => { handle.cancel(); jobs.delete(key); };
  job.cancel = () => { job.stop(); update({}); };
  handle.done
    .then((result) => { job.status = 'done'; job.result = result; })
    .catch((e) => { if (!e.cancelled) { job.status = 'error'; job.error = e.message; } })
    .finally(() => update({}));
  return job;
}
/** A new key makes the searches for the old one pointless: stop them. */
function pruneLive(s) {
  for (const [k, j] of [...jobs]) if (k.startsWith('live') && !k.endsWith(`${s.Q.x} ${s.bits}`) && j.status === 'running') j.stop();
}
const liveBusy = () => [...jobs].some(([k, j]) => k.startsWith('live') && j.status === 'running');

/** A progress line that follows a running job without redrawing the page. */
function progressView(job, text) {
  const label = el('span', { class: 'small muted', role: 'status', text: text(job.progress) });
  const bar = el('progress', { max: 1, value: job.progress?.fraction ?? 0, 'aria-label': 'progress' });
  job.nodes.add((p) => { bar.value = p.fraction ?? 0; label.textContent = text(p); });
  return el('div', { class: 'running' }, [label, bar, el('button', { type: 'button', text: 'Cancel', onclick: () => job.cancel() })]);
}

/* ---------- input ---------- */

function inputCard(s, update) {
  const bitsIn = el('input', { id: 'in-bits', type: 'number', class: 'num', min: 8, max: 40, value: String(s.bits), onkeydown: (e) => e.key === 'Enter' && newKey() });
  function newKey() { const b = clampBits(bitsIn.value); update({ bits: b, d: String(keygen(b).d) }); }
  return el('div', { class: 'card' }, [
    el('div', { class: 'row' }, [
      field('key range: d ≤ 2^bits', bitsIn),
      el('button', { class: 'primary', type: 'button', text: 'New key', onclick: newKey }),
    ]),
    el('p', { class: 'small muted', style: 'margin:10px 0 0', html:
      'The key is shared with the <a href="ecc.html">Toy ECC</a> page: these attacks break the key that page encrypts with. Raise the range to watch the searches slow down — brute force doubles with every extra bit, the other two grow by √2.' }),
    el('div', { class: 'cols', style: 'margin-top:12px' }, [
      el('div', {}, [el('h3', { text: 'the attacker knows' }), facts([
        ['the curve and its generator', 'secp256k1, G'],
        ['the public key', short(hx(s.Q), 16)],
        ['the key range (Kerckhoffs)', `d ∈ [1, ${pow2(s.bits)}] = [1, ${fmt(s.N)}]`],
      ])]),
      el('div', {}, [el('h3', { text: 'the attacker wants' }), facts([
        ['the private key d', '?'],
        ['shown here only to check the result', `d = ${fmt(s.d)}`],
        ['a ciphertext?', 'not needed'],
      ])]),
    ]),
  ]);
}

/* ---------- the test ---------- */

function testCard() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'An exact test, so only the search is hard' }),
    el('p', { class: 'formula', html: 'a guess d′ is right &nbsp;⇔&nbsp; d′G = Q' }),
    el('p', { text: 'Against Caesar the attacker had to recognise English, and the recogniser could be fooled. Here the public key itself is a perfect test: one scalar multiplication says yes or no, with no statistics, no language model and no false positives. And it needs no ciphertext at all — the public key is published once and stays valid for every message ever sent with it.' }),
    explain([
      'So the security of the toy rests entirely on the number of candidates. With d ∈ [1, 2²⁰] there are about a million, and the three searches below find the key in seconds or less. Each one is a different way of organising the same exact test.',
      'PRACTICE: Real ECC draws d uniformly from [1, n − 1], n ≈ 2²⁵⁶ ≈ 1.16·10⁷⁷. The test is just as exact, but there are about 10⁷⁷ candidates — see the last panel.',
    ]),
  ]);
}

/* ---------- 1. brute force ---------- */

function brutePanel(s, update) {
  const key = `live brute ${s.Q.x} ${s.bits}`;
  let job = jobs.get(key);
  if (!job && estimate('brute', s.bits) <= AUTO && !liveBusyOther(key)) job = start(key, { job: 'attack', method: 'brute', x: s.Q.x, y: s.Q.y, range: s.N }, update);
  const firsts = [1n, 2n, 3n, 4n, 5n].map((k) => [k, mulG(k)]);
  const res = job?.status === 'done' ? job.result : null;
  return el('div', { class: 'card' }, [
    el('div', { class: 'step-head' }, [el('span', { class: 'step-no', text: '1' }), el('h2', { text: 'Brute force: try every key in order' })]),
    el('p', { class: 'formula', html: 'P₁ = G, &nbsp;P<sub>k+1</sub> = P<sub>k</sub> + G &nbsp;— stop when P<sub>k</sub> = Q, then d = k' }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data walk' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'k' }), el('th', { class: 'left', text: 'P_k = kG (compressed)' }), el('th', { class: 'left', text: '= Q ?' })])]),
      el('tbody', {}, [
        ...firsts.filter(([k]) => !res || k < res.d).map(([k, P]) => el('tr', {}, [el('td', { text: String(k) }), el('td', { class: 'left mono', text: short(hx(P), 22) }), el('td', { class: 'left diff', text: '✘ no' })])),
        !res || res.d > 6n ? el('tr', {}, [el('td', { text: '…' }), el('td', { class: 'left muted', text: res ? `${fmt(res.d - 6n)} more candidates, each one addition and the same comparison` : job ? 'the walk goes on in a worker' : 'the walk would go on in a worker' }), el('td', {})]) : null,
        res ? el('tr', { class: 'is-current' }, [el('td', { text: fmt(res.d) }), el('td', { class: 'left mono', text: short(hx(s.Q), 22) }), el('td', { class: 'left same', text: '✔ = Q' })]) : null,
      ]),
    ])]),
    jobView(job, 'brute', s, update, (p) => p ? `tested ${fmt(p.steps)} of ${fmt(s.N)} candidates · ${fmt(Math.round(p.steps / Math.max(1e-3, p.seconds)))} per second · ${p.seconds.toFixed(1)} s` : 'starting…'),
    res ? facts([
      ['recovered key', `d = ${fmt(res.d)} ${res.d === s.d ? '✔ (the real one)' : '✘'}`],
      ['candidates tried', `${fmt(res.ops + 1)} — on average (N + 1)/2 = ${fmt((s.N + 1n) / 2n)}`],
      ['additions per second, measured', fmt(Math.round(res.ops / Math.max(1e-6, res.seconds)))],
      ['memory', 'one point'],
      ['time', humanTime(res.seconds)],
    ]) : null,
    explain([
      'Each candidate costs one point addition, not a fresh scalar multiplication: kG is simply (k − 1)G + G. The comparison with Q is done in Jacobian coordinates (X = x·Z², Y = y·Z³), so the walk never pays for a modular inversion.',
      'If d is uniform in [1, N], the number of tries is uniform too, with mean (N + 1)/2: the work doubles with every extra bit of key. That is the whole story of key size against exhaustive search.',
    ]),
  ]);
}

function liveBusyOther(key) { return [...jobs].some(([k, j]) => k !== key && k.startsWith('live') && j.status === 'running'); }

/** The state of a live job: a run button (too slow to start by itself), progress, or an error. */
function jobView(job, id, s, update, text) {
  if (!job) {
    const est = estimate(id, s.bits);
    return el('div', { class: 'row', style: 'margin:8px 0 12px' }, [
      el('button', { type: 'button', class: 'primary', text: `Run (≈ ${humanTime(est)})`, onclick: () => { start(`live ${id} ${s.Q.x} ${s.bits}`, { job: 'attack', method: id, x: s.Q.x, y: s.Q.y, range: s.N }, update); update({}); } }),
      el('span', { class: 'small muted', text: est > AUTO ? 'not started by itself: it would take a while' : 'waiting for the other searches to finish' }),
    ]);
  }
  if (job.status === 'running') return progressView(job, text);
  if (job.status === 'error') return el('p', { class: 'err', text: job.error });
  return null;
}

/* ---------- 2. baby-step giant-step ---------- */

function bsgsGrid(m, hit) {
  // the key space as an m × m square: row i = giant step i, column j = baby step j, cell = i·m + j
  const V = Math.min(16, m), cell = 18, pad = 70, W = pad + V * cell + 10, H = 26 + V * cell + 30;
  const scale = m / V;                                  // keys per drawn cell along each side
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'gridsvg', role: 'img', 'aria-label': 'the key space as a square: baby steps fill the first row, giant steps jump down the rows' });
  const hi = hit ? Math.min(V - 1, Math.floor(hit.i / scale)) : -1, hj = hit ? Math.min(V - 1, Math.floor(hit.j / scale)) : -1;
  for (let r = 0; r < V; r++) {
    for (let c = 0; c < V; c++) {
      const cls = r === hi && c === hj ? 'hit' : r === 0 ? 'baby' : hit && r <= hi ? 'giant' : 'idle';
      svg.append(svgEl('rect', { x: pad + c * cell, y: 26 + r * cell, width: cell - 2, height: cell - 2, rx: 3, class: cls }));
    }
  }
  svg.append(svgEl('text', { x: pad, y: 16, class: 'lbl' }, `j = 0 … ${fmt(m - 1)}  → baby steps jG (stored)`));
  svg.append(svgEl('text', { x: 4, y: 26 + cell * 0.7, class: 'lbl' }, 'i = 0'));
  if (hit) svg.append(svgEl('text', { x: 4, y: 26 + hi * cell + cell * 0.7, class: 'lbl strong' }, `i = ${fmt(hit.i)}`));
  svg.append(svgEl('text', { x: 4, y: 26 + (V - 1) * cell + cell * 0.7, class: 'lbl' }, `i = ${fmt(m - 1)}`));
  svg.append(svgEl('text', { x: pad, y: H - 8, class: 'lbl' }, scale > 1 ? `each square stands for ${fmt(Math.round(scale))} × ${fmt(Math.round(scale))} keys` : 'each square is one key'));
  return svg;
}

function bsgsPanel(s, update) {
  const key = `live bsgs ${s.Q.x} ${s.bits}`;
  let job = jobs.get(key);
  if (!job && estimate('bsgs', s.bits) <= AUTO && !liveBusyOther(key)) job = start(key, { job: 'attack', method: 'bsgs', x: s.Q.x, y: s.Q.y, range: s.N }, update);
  const res = job?.status === 'done' ? job.result : null;
  const m = Math.ceil(Math.sqrt(Number(s.N)));
  return el('div', { class: 'card' }, [
    el('div', { class: 'step-head' }, [el('span', { class: 'step-no', text: '2' }), el('h2', { text: 'Baby-step giant-step: trade memory for time' })]),
    el('p', { class: 'formula', html: `d = i·m + j, &nbsp;m = ⌈√N⌉ = ${fmt(m)} &nbsp;⇒&nbsp; Q − i·(mG) = jG` }),
    el('div', { class: 'cols wide-first' }, [
      el('div', { class: 'diagram' }, [bsgsGrid(m, res)]),
      el('ol', { class: 'steps' }, [
        el('li', { html: `<strong>Baby steps.</strong> Compute G, 2G, …, (m − 1)G and store each point in a table: ${fmt(m)} points of memory.` }),
        el('li', { html: '<strong>One jump size.</strong> Compute mG once, by double-and-add.' }),
        el('li', { html: '<strong>Giant steps.</strong> Start at Q and subtract mG again and again: Q, Q − mG, Q − 2mG, … After each step, look the point up in the table.' }),
        el('li', { html: res ? `<strong>Hit</strong> at giant step i = ${fmt(res.i)}: Q − ${fmt(res.i)}·mG = ${fmt(res.j)}·G, so d = ${fmt(res.i)}·${fmt(m)} + ${fmt(res.j)} = <strong>${fmt(res.d)}</strong> ${res.d === s.d ? '✔' : '✘'}` : '<strong>Hit</strong>: the row i and column j of the match give d = i·m + j.' }),
      ]),
    ]),
    jobView(job, 'bsgs', s, update, (p) => p ? `${p.phase === 'baby' ? 'filling the table' : 'giant steps'} · ${fmt(p.steps)} additions · ${p.seconds.toFixed(1)} s` : 'starting…'),
    res ? facts([
      ['additions', `${fmt(res.ops)} = ${fmt(res.m - 1)} baby + ${fmt(res.giants)} giant — brute force needed ${fmt(s.d)}`],
      ['memory', `${fmt(res.memory)} points (≥ ${humanBytes(res.memory * 32)} for their x-coordinates alone)`],
      ['time', humanTime(res.seconds)],
    ]) : null,
    explain([
      'The square holds all N keys: key i·m + j sits in row i, column j. Brute force reads it cell by cell. BSGS stores the first row — the baby steps jG — and then moves down one row per giant step, because subtracting mG from Q subtracts m from the unknown d. When Q − i·mG lands on a stored point jG, the row and the column give d.',
      'At most m baby steps and m giant steps: about 2√N additions instead of N/2. The price is the table of √N points. For N = 2²⁰ that is a thousand points; for N = 2⁶⁴ it would be four billion; for real keys, 2¹²⁸ points — far more memory than exists.',
      'Both phases compute their points in batches of up to 1024 in Jacobian form and convert each batch to affine coordinates with one inversion (Montgomery’s trick), because the table needs the actual x-coordinates.',
    ]),
  ]);
}

/* ---------- 3. kangaroo ---------- */

function kangarooLine(res, s) {
  const N = Number(s.N), xs = [...res.trail.tame, ...res.trail.wild, res.meet, N];
  const lo = 0, hi = Math.max(...xs) * 1.02, W = 640, H = 120, pad = 14;
  const X = (v) => pad + ((v - lo) / (hi - lo)) * (W - 2 * pad);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'linesvg', role: 'img', 'aria-label': 'positions of the tame and wild kangaroos on the number line, and where their trails meet' });
  svg.append(svgEl('rect', { x: X(1), y: 50, width: X(N) - X(1), height: 8, rx: 3, class: 'range' }));
  svg.append(svgEl('text', { x: X(N), y: 72, class: 'lbl', 'text-anchor': 'end' }, `N = ${pow2(s.bits)}`));
  svg.append(svgEl('text', { x: X(0), y: 72, class: 'lbl' }, '0'));
  res.trail.tame.forEach((v) => svg.append(svgEl('circle', { cx: X(v), cy: 34, r: 3.5, class: 'tame' })));
  res.trail.wild.forEach((v) => svg.append(svgEl('circle', { cx: X(v), cy: 92, r: 3.5, class: 'wild' })));
  svg.append(svgEl('line', { x1: X(Number(s.N) / 2), y1: 24, x2: X(Number(s.N) / 2), y2: 58, class: 'mark' }));
  svg.append(svgEl('text', { x: X(Number(s.N) / 2) + 4, y: 20, class: 'lbl' }, 'tame starts at N/2'));
  svg.append(svgEl('line', { x1: X(Number(res.d)), y1: 50, x2: X(Number(res.d)), y2: 102, class: 'mark' }));
  svg.append(svgEl('text', { x: X(Number(res.d)) + 4, y: 114, class: 'lbl' }, `wild starts at d = ${fmt(res.d)}`));
  svg.append(svgEl('line', { x1: X(res.meet), y1: 26, x2: X(res.meet), y2: 100, class: 'meet' }));
  svg.append(svgEl('text', { x: Math.min(W - 60, X(res.meet) + 4), y: 46, class: 'lbl strong' }, 'trails meet'));
  return svg;
}

function kangarooPanel(s, update) {
  const key = `live kangaroo ${s.Q.x} ${s.bits}`;
  let job = jobs.get(key);
  if (!job && estimate('kangaroo', s.bits) <= AUTO && !liveBusyOther(key)) job = start(key, { job: 'attack', method: 'kangaroo', x: s.Q.x, y: s.Q.y, range: s.N }, update);
  const res = job?.status === 'done' ? job.result : null;
  return el('div', { class: 'card' }, [
    el('div', { class: 'step-head' }, [el('span', { class: 'step-no', text: '3' }), el('h2', { text: 'Pollard’s kangaroo: the same speed with almost no memory' })]),
    el('p', { class: 'formula', html: 'jump from P by 2<sup>(x(P) mod K)</sup>·G; &nbsp;tame from (N/2)G, wild from Q; &nbsp;same point ⇒ N/2 + dist<sub>tame</sub> = d + dist<sub>wild</sub>' }),
    res ? el('div', { class: 'diagram' }, [kangarooLine(res, s), el('div', { class: 'legend' }, [
      el('span', {}, [el('i', { class: 'k-tame' }), 'tame kangaroo: stored points (position known)']),
      el('span', {}, [el('i', { class: 'k-wild' }), 'wild kangaroo: stored points (position d + distance, known only now)']),
    ])]) : null,
    el('ol', { class: 'steps' }, [
      el('li', { html: `<strong>Jumps.</strong> K = ${res ? res.K : '…'} jump sizes 1, 2, 4, …, 2<sup>K−1</sup>; which one is taken depends only on the point the kangaroo stands on. Mean jump ≈ √N/2${res ? ` = ${fmt(Math.round(res.meanJump))}` : ''}.` }),
      el('li', { html: '<strong>Two kangaroos.</strong> The tame one starts at the known point (N/2)G, the wild one at Q = dG. Both hop, and each adds up the distance it has covered.' }),
      el('li', { html: `<strong>Footprints.</strong> Points whose x ends in ${res ? res.dpBits : 's'} zero bits are “distinguished”: they are stored with the tame position or the wild distance. Everything else is forgotten.` }),
      el('li', { html: res ? `<strong>Meeting.</strong> Once the wild kangaroo lands where the tame one has been, it follows the same jumps for ever and soon reaches a stored point: d = N/2 + dist<sub>tame</sub> − dist<sub>wild</sub> = <strong>${fmt(res.d)}</strong> ${res.d === s.d ? '✔' : '✘'}` : '<strong>Meeting.</strong> When both have stored the same point, the distances give d.' }),
    ]),
    jobView(job, 'kangaroo', s, update, (p) => p ? `${fmt(p.steps)} hops · ${p.seconds.toFixed(1)} s` : 'starting…'),
    res ? facts([
      ['hops, both kangaroos', `${fmt(res.ops)} ≈ ${(res.ops / Math.sqrt(Number(s.N))).toFixed(1)}·√N`],
      ['memory', `${fmt(res.memory)} stored points (BSGS: ${fmt(Math.ceil(Math.sqrt(Number(s.N))))})`],
      ['restarts of the wild kangaroo', String(res.restarts)],
      ['time', humanTime(res.seconds)],
    ]) : null,
    explain([
      'The jumps are a function of the point, not of chance, so two kangaroos that ever stand on the same point follow the same path from then on — like footprints in snow. The tame kangaroo’s position is always known; the wild one’s is d plus its distance. One shared point gives one equation, and d drops out of it.',
      'Why √N hops: both walk about the same stretch of the key space with mean jump √N/2, and after about √N hops each the wild one is all but certain to have landed on a point of the tame trail. The analysis is probabilistic — a birthday-style argument — although nothing in the walk is random.',
      'Memory is only the distinguished points, one in about √N/16 of the hops: a few dozen points instead of BSGS’s √N. That is why kangaroo (and Pollard’s rho, its cousin for keys anywhere in [1, n]) is what one actually runs at scale, on many machines at once with a shared table of distinguished points.',
      'In this implementation each hop needs the affine x-coordinate to choose its jump, so it pays one inversion per pair of hops; it is slower per addition than BSGS here, though it does the same number of additions.',
    ]),
  ]);
}

/* ---------- 4. the whole message ---------- */

function messagePanel(s) {
  const found = ['bsgs', 'kangaroo', 'brute'].map((id) => jobs.get(`live ${id} ${s.Q.x} ${s.bits}`)).find((j) => j?.status === 'done' && j.result.d);
  const ct = encrypt(s.Q, s.msg);
  const dec = found ? decrypt(found.result.d, ct) : null;
  return el('div', { class: 'card' }, [
    el('h2', { text: 'With d, every message falls' }),
    facts([
      ['the shared message, encrypted to Q now (fresh k)', `C₁ = ${short(hx(ct[0].C1), 14)}, C₂ = ${short(hx(ct[0].C2), 14)}${ct.length > 1 ? ` (+${ct.length - 1} chunk(s))` : ''}`],
      ['decrypted with the recovered key', dec ? `“${dec.text}”` : 'waiting for a search to finish'],
    ]),
    explain([
      'The attack never looked at a ciphertext: it recovered the private key from the public key alone. With d the attacker is the receiver — every message ever encrypted to Q, past and future, opens with the normal decryption S = dC₁, M = C₂ − S.',
      'That is the difference between this break and the Caesar one: there each ciphertext had to be long enough to be recognised as English; here one search, done once, breaks everything.',
    ]),
  ]);
}

/* ---------- 5. the experiment ---------- */

function experimentPanel(state, update) {
  const seed = Math.max(0, Number.parseInt(state.seed, 10) || 1) >>> 0;
  const keys = METHODS.map((m) => `exp ${m.id} ${seed}`);
  if (!liveBusy()) METHODS.forEach((m, i) => { if (!jobs.has(keys[i])) start(keys[i], { job: 'experiment', method: m.id, seed }, update); });
  const parts = METHODS.map((m, i) => ({ m, job: jobs.get(keys[i]) }));
  const sIn = el('input', { type: 'number', class: 'num', min: 0, value: String(seed) });
  const head = [
    el('h2', { text: 'The experiment: time against key-space size' }),
    el('p', { class: 'question', text: 'How does the work of each search grow with the size N of the key space — and does it follow N and √N as the theory says?' }),
    el('div', { class: 'how' }, [el('div', { class: 'label', text: 'How the experiment works' }), el('ol', {}, [
      el('li', { html: `For each key range N = 2<sup>b</sup> (brute force: b = ${SIZES.brute[0]}…${SIZES.brute.at(-1)}; BSGS and kangaroo: b = ${SIZES.bsgs[0]}…${SIZES.bsgs.at(-1)}), draw keys d (${REPS.brute} for brute force, ${REPS.bsgs} for the others), one from each equal slice of [1, N], with the seeded generator;` }),
      el('li', { html: 'publish Q = dG and let the method recover d from Q alone, counting the point additions and timing the run;' }),
      el('li', { html: 'average per size, and fit a straight line to log(additions) against log(N): its slope is the exponent of the growth — 1 for N, ½ for √N;' }),
      el('li', { html: 'the three methods run in three workers at once; the additions per second measured here drive the extrapolation below.' }),
    ])]),
    el('div', { class: 'row' }, [field('seed', sIn), el('button', { class: 'primary', type: 'button', text: 'Run', onclick: () => update({ seed: sIn.value }) })]),
    el('ul', { class: 'hints' }, [el('li', { html: '<strong>seed</strong> — the same seed gives the same keys and the same counts; times vary a little from run to run with the machine’s load.' })]),
  ];
  if (parts.some((p) => !p.job || p.job.status !== 'done')) {
    return el('div', { class: 'card lab' }, [...head, ...parts.map(({ m, job }) => !job
      ? el('p', { class: 'small muted', text: `${m.label}: waits until the live searches above have finished (so they do not compete for the processor).` })
      : job.status === 'error' ? el('p', { class: 'err', text: `${m.label}: ${job.error}` })
      : job.status === 'done' ? el('p', { class: 'small ok', text: `${m.label}: done` })
      : progressView(job, (p) => `${m.label}${p?.label ? ` · ${p.label}` : ''} · about ${Math.round(100 * (p?.fraction ?? 0))} %`))]);
  }
  const R = Object.fromEntries(parts.map(({ m, job }) => [m.id, job.result]));
  const series = (f) => METHODS.map((m) => ({ label: `${m.label} (slope ${f === 'ops' ? R[m.id].opsSlope.slope.toFixed(2) : R[m.id].timeSlope?.slope.toFixed(2) ?? '—'})`, color: m.color, points: R[m.id].rows.map((r) => [r.N, f === 'ops' ? Math.max(1, r.ops) : Math.max(1e-5, r.seconds)]) }));
  const xTicks = [10, 14, 18, 22, 26, 30].map((b) => 2 ** b);
  const p10 = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => 10 ** (lo + i));
  const sup = (v) => `10${String(Math.round(Math.log10(v))).replace(/[-\d]/g, (c) => (c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]))}`;
  const xFormat = (v) => pow2(Math.round(Math.log2(v)));
  const opsChart = lineChart({ series: series('ops'), logX: true, logY: true, xTicks, yTicks: p10(1, 7), yMin: 10, yMax: 1e7, xFormat, yFormat: sup, endLabels: false, xTitle: 'key range N (log scale)', yTitle: 'point additions (log scale)', height: 260,
    tip: (x, v) => `N = ${xFormat(x)}\n${METHODS.map((m, i) => `${m.label}: ${v[i] === undefined ? '—' : fmt(Math.round(v[i]))}`).join('\n')}` });
  const timeChart = lineChart({ series: series('time'), logX: true, logY: true, xTicks, yTicks: p10(-4, 2), yMin: 1e-4, yMax: 100, xFormat, yFormat: sup, endLabels: false, xTitle: 'key range N (log scale)', yTitle: 'seconds (log scale)', height: 260,
    tip: (x, v) => `N = ${xFormat(x)}\n${METHODS.map((m, i) => `${m.label}: ${v[i] === undefined ? '—' : humanTime(v[i])}`).join('\n')}` });
  const allBits = SIZES.bsgs;
  return el('div', { class: 'card lab' }, [
    ...head,
    el('div', { class: 'answer' }, [el('div', { class: 'label', text: 'Result' }), el('p', { html:
      `The work of brute force grows like N<sup>${R.brute.opsSlope.slope.toFixed(2)}</sup>, that of baby-step giant-step like N<sup>${R.bsgs.opsSlope.slope.toFixed(2)}</sup> and that of the kangaroo like N<sup>${R.kangaroo.opsSlope.slope.toFixed(2)}</sup> — the theory says 1, ½ and ½. ` +
      `This browser does about ${fmt(Math.round(R.brute.rate))} additions per second.` })]),
    el('h3', { class: 'section' }, [el('span', { class: 'n', text: '1' }), 'Point additions against N']),
    el('p', { class: 'caption', text: 'Both axes logarithmic, so a power law is a straight line and its slope is the exponent. Brute force rises one decade per decade of N; the two √N methods half as steeply.' }),
    opsChart, chartLegend(series('ops')),
    el('h3', { class: 'section' }, [el('span', { class: 'n', text: '2' }), 'Seconds against N']),
    el('p', { class: 'caption', text: 'The same in time. At small N fixed costs (setting up tables, one scalar multiplication) flatten the lines; the slopes are fitted from N = 2¹⁴ on.' }),
    timeChart, chartLegend(series('time')),
    el('h3', { class: 'section' }, [el('span', { class: 'n', text: '3' }), 'The numbers']),
    el('p', { class: 'caption', text: 'Mean additions and mean time per key range; memory is the largest table seen (points).' }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data grouped' }, [
      el('thead', {}, [
        el('tr', {}, [el('th', {}), ...METHODS.map((m) => el('th', { colspan: m.id === 'brute' ? 2 : 3, class: 'group' }, [el('i', { class: 'swatch', style: `background:${m.color}` }), m.label]))]),
        el('tr', {}, [el('th', { text: 'N' }), ...METHODS.flatMap((m) => ['additions', 'time', ...(m.id === 'brute' ? [] : ['memory'])].map((h) => el('th', { text: h })))]),
      ]),
      el('tbody', {}, allBits.map((b) => {
        const row = (id) => R[id].rows.find((r) => r.bits === b);
        return el('tr', {}, [
          el('td', { text: pow2(b) }),
          ...METHODS.flatMap((m) => {
            const r = row(m.id), n = m.id === 'brute' ? 2 : 3;
            if (!r) return Array.from({ length: n }, () => el('td', { class: 'muted', text: '—' }));
            return [el('td', { text: fmt(Math.round(r.ops)) }), el('td', { text: humanTime(r.seconds) }), ...(n === 3 ? [el('td', { text: fmt(r.memory) })] : [])];
          }),
        ]);
      })),
    ])]),
    el('p', { class: 'why matters', html: 'with an exact test the only defence is the size of the search. Every extra bit of key doubles brute force and multiplies the best generic attacks by √2 — so a key must be twice as long as the security level it promises.' }),
    explain([
      'The fitted slope is a regression of log₂(additions) on log₂(N) over the sizes from 2¹⁴ up. Brute force’s additions are exactly d − 1 for the key drawn, so its slope sits close to 1; the two √N methods vary more from key to key, which is why five keys per size are drawn for them.',
      'Times are less clean than counts, for two reasons worth seeing. Fixed costs (a scalar multiplication, setting up a table) flatten the small sizes. And BSGS’s time usually grows <em>faster</em> than its additions: its table grows with √N, and a bigger hash table means more cache misses and more garbage collection — the memory price of the method, showing up as time. The kangaroo, with its few dozen stored points, does not pay it.',
    ]),
  ]);
}

/* ---------- 6. extrapolation ---------- */

function extrapolationPanel(s, seed) {
  const done = METHODS.map((m) => jobs.get(`exp ${m.id} ${seed}`));
  const exp = done.every((j) => j?.status === 'done') ? Object.fromEntries(METHODS.map((m, i) => [m.id, done[i].result.rate])) : null;
  const liveRate = (id) => { const j = jobs.get(`live ${id} ${s.Q.x} ${s.bits}`); return j?.status === 'done' && j.result.seconds > 0.05 ? j.result.ops / j.result.seconds : null; };
  const rate = Object.fromEntries(METHODS.map((m) => [m.id, exp?.[m.id] ?? liveRate(m.id) ?? GUESS_RATE[m.id]]));
  const source = exp ? 'measured by the experiment above' : 'rough figures until the experiment finishes';
  const BIG = 1e12;
  const rows = [s.bits, 32, 64, 128, 256].filter((b, i, a) => a.indexOf(b) === i).sort((a, b) => a - b);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'From the toy to real keys' }),
    el('p', { class: 'small muted', text: `Expected work: brute force N/2, BSGS ≈ 1.5√N, kangaroo ≈ 2√N additions. Rates in this browser: ${METHODS.map((m) => `${m.label} ${fmt(Math.round(rate[m.id]))}/s`).join(', ')} (${source}); and, for comparison, a hypothetical cluster doing 10¹² additions per second.` }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data prose extrap' }, [
      el('thead', {}, [el('tr', {}, ['key range', 'brute force here', 'BSGS here', 'BSGS memory', 'kangaroo here', 'best of them at 10¹²/s'].map((h, i) => el('th', { class: i ? null : 'left', text: h })))]),
      el('tbody', {}, [
        ...rows.map((b) => el('tr', { class: b === s.bits ? 'is-current' : null }, [
          el('td', { class: 'left', text: `${pow2(b)}${b === s.bits ? ' (this key)' : b === 256 ? ' (a full-size key, by these methods)' : ''}` }),
          el('td', { text: humanTime(expectedOps.brute(b) / rate.brute) }),
          el('td', { text: humanTime(expectedOps.bsgs(b) / rate.bsgs) }),
          el('td', { text: humanBytes(2 ** (b / 2) * 32) }),
          el('td', { text: humanTime(expectedOps.kangaroo(b) / rate.kangaroo) }),
          el('td', { text: humanTime(expectedOps.bsgs(b) / BIG) }),
        ])),
        el('tr', { class: 'real' }, [
          el('td', { class: 'left', html: '<strong>real secp256k1</strong>: d ∈ [1, n − 1], Pollard rho, √(πn/2) ≈ 2<sup>128.3</sup> additions' }),
          el('td', { class: 'muted', text: '—' }), el('td', { class: 'muted', text: '—' }), el('td', { class: 'muted', text: 'a few points' }),
          el('td', { text: humanTime(rhoFullOps / rate.kangaroo) }),
          el('td', { text: humanTime(rhoFullOps / BIG) }),
        ]),
      ]),
    ])]),
    el('p', { class: 'small muted', style: 'margin-top:8px', text: 'For scale: the universe is about 1.4·10¹⁰ years old.' }),
    explain([
      'The same three searches that take seconds on the toy need about 10¹⁹ years at 10¹² additions per second against a properly generated key — and BSGS would need more memory than there are atoms to write it on. Nothing about the attack changes; only the number of candidates does.',
      'No cleverer generic attack exists: in the generic group model (Shoup, 1997) any algorithm that only adds and compares points needs on the order of √n operations, and rho reaches that bound. For well-chosen curves such as secp256k1 no index-calculus-style shortcut is known either — the reason 256-bit ECC matches 3072-bit RSA at about 128-bit security.',
      'And there is nothing statistical to exploit instead: d is uniform, and the ciphertexts look uniform (the byte histogram on the Toy ECC page). The Caesar attack lived off the redundancy of English; here there is none to live off.',
      'PRACTICE: The one known exception is a large fault-tolerant quantum computer: Shor’s algorithm solves the ECDLP in polynomial time. That is why post-quantum key exchange (ML-KEM, standardised in 2024) is being deployed alongside elliptic curves.',
    ]),
  ]);
}

/* ---------- the page ---------- */

startPage({
  shell: hw03Shell('break-ecc.html'),
  sticky: STICKY,
  memory: MEMORY,
  render: ({ state, update, patch }) => {
    const k = readKey(state, patch);
    const s = { ...k, N: 2n ** BigInt(k.bits) };
    const seed = Math.max(0, Number.parseInt(state.seed, 10) || 1) >>> 0;
    pruneLive(s);
    return [
      inputCard(s, update),
      testCard(),
      brutePanel(s, update),
      bsgsPanel(s, update),
      kangarooPanel(s, update),
      messagePanel(s),
      experimentPanel(state, update),
      extrapolationPanel(s, seed),
    ];
  },
});
