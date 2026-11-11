/* new-homework.mjs — scaffold the next homework, or a page inside one, already
   wired to the shared shell and following the pattern hw05 settled on: a
   PAGES list with blurbs, STICKY/MEMORY shared parameters, one input dock at
   the bottom of the window that rejects bad values with a reason, a Web
   Worker with a per-page cache (the previous result stays on screen while a
   new one computes), formulas through math.js, a home page that lists the
   pages, experiment panels from assets/js/ui/lab.js, and an essay.
   Writes files and never overwrites. Development tool, not part of the site.

   node tools/new-homework.mjs hw    06 "Title shown in the header" "subtitle"
   node tools/new-homework.mjs page  06 entropy "Heading of the page"
   node tools/new-homework.mjs lab   06 entropy "Heading of the page"   (a page with an experiment in the worker)
   node tools/new-homework.mjs essay 06 "Title of the essay"
*/

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , command, nn, third, fourth] = process.argv;
const hw = `hw${nn}`;
const HW = `HW${nn}`;

const put = (path, body) => {
  if (existsSync(path)) { console.log(`kept    ${path} (already exists)`); return; }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  console.log(`created ${path}`);
};

const head = (title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="../assets/css/base.css">
<link rel="stylesheet" href="css/${hw}.css">
</head>
<body>`;

const pageHtml = ({ title, heading, slug, lead }) => `${head(title)}
<main class="wrap">
  <h1>${heading}</h1>
  <p class="lead">${lead}</p>
  <div id="app"></div>
</main>
<script type="module" src="js/pages/${slug}-page.js"></script>
</body>
</html>
`;

const shellJs = (title, subtitle) => `/* shell.js — what the header, the tab bar and the footer say on every page
   of this homework. One place to add a page to the navigation. */

/* every page, in reading order; \`built\` turns a page on in the tabs and in
   the home page's list as its phase is finished */
export const PAGES = [
  { href: 'index.html', label: 'Home', built: true },
];

/** The honesty note: in the footer of every page (at the top of the home page instead if footer: false). */
export const NOTICE = 'Educational toy. Everything runs in your browser; nothing is sent anywhere.';

/** Shell arguments for one page of ${hw}. @param {string} current its filename */
export const ${hw}Shell = (current) => ({
  title: '${HW} · ${title}',
  subtitle: '${subtitle}',
  links: PAGES.filter((p) => p.built),
  current,
  home: '../index.html',
  notice: NOTICE,
  // footer: false,   // only if the user asks (hw02, hw04); then show NOTICE on the home page
});

/* What every page shares (the subject being looked at: a key, a model, a
   seed), remembered between pages; an explicit URL always wins. */
export const STICKY = ['n', 'seed'];
export const MEMORY = '${hw}';
`;

const inputsJs = () => `/* inputs.js — the inputs every page of ${hw} shares, in the input dock at the
   bottom of the window (assets/js/ui/dock.js). It also reads and validates
   them from the page state, so every page agrees on the defaults. A value out
   of range is rejected with a reason, never silently clamped. A page's own
   controls go in a second section, labelled "this page" (see the page template). */

import { el, field } from '../../../assets/js/ui/dom.js';
import { nice } from '../../../assets/js/ui/format.js';
import { inputDock, show, onCommit, numberOr, freshSeed } from '../../../assets/js/ui/dock.js';

export { rejected } from '../../../assets/js/ui/dock.js';

export const DEFAULTS = { n: 100, seed: ${Number(nn) * 1000 + 1} };

/**
 * The inputs a page is looking at, from its state.
 * @returns {{n: number, seed: number, error: string|null}}  error says why a value was rejected
 */
export function readInputs(state) {
  const n = Math.round(numberOr(state.n, DEFAULTS.n));
  const seed = Math.round(numberOr(state.seed, DEFAULTS.seed));
  let error = null;
  if (!(n >= 2 && n <= 100000)) error = \`n must be between 2 and 100 000 (got \${n}).\`;
  else if (!(seed >= 0 && seed <= 4294967295)) error = \`the seed must be an integer between 0 and 4 294 967 295 (got \${seed}).\`;
  return { n, seed, error };
}

const SHARED = {
  id: 'shared',
  build(apply, later) {
    const n = el('input', { type: 'number', class: 'num', min: 2, max: 100000, 'aria-label': 'sample size n' });
    const seed = el('input', { type: 'number', class: 'num', min: 0, 'aria-label': 'seed' });
    const go = () => apply({ n: n.value, seed: seed.value });
    for (const input of [n, seed]) onCommit(input, go, later);
    return {
      nodes: [el('div', { class: 'row' }, [
        field('n', n),
        el('span', { class: 'vrule' }),
        field('seed', seed),
        el('button', { type: 'button', text: 'New seed', onclick: () => apply({ seed: freshSeed() }) }),
      ])],
      refresh(v) { show(n, v.n); show(seed, v.seed); },
    };
  },
  summary: (v) => \`n = \${nice(v.n)} · seed \${v.seed}\`,
  notes: [
    'Every change applies at once and the charts redraw in place: the previous result stays on screen, marked "updating…", until the new one is ready. These inputs are shared by all the pages of this homework.',
    '<strong>n</strong>: what it changes, in one or two sentences.',
    '<strong>seed</strong>: the simulations use xoshiro128**, a fast seeded generator, not a cryptographic one: a simulation needs reproducibility, not secrecy. "New seed" draws one from <code>crypto.getRandomValues</code>, the only real randomness on these pages.',
  ],
};

/**
 * Mount or refresh the dock; returns null, so it takes no place in the page.
 * @param {object|null} [page]  the page's own section ({id, label: 'this page', build, summary, notes}), its value as pageValue
 */
export const dock = (inputs, update, page = null, pageValue = null) => inputDock({
  id: '${hw}', title: 'Inputs', update,
  sections: page ? [SHARED, page] : [SHARED],
  values: { shared: inputs, ...(page ? { [page.id]: pageValue } : {}) },
  message: inputs.error ? { text: \`Rejected: \${inputs.error}\`, kind: 'err' } : null,
});
`;

const widgetsJs = () => `/* widgets.js — the visual language of the ${hw} plots (simulation in --s1,
   theory in --s2), the runner around this homework's worker, and the shared
   figure helpers re-exported, so a page imports its drawing kit from one place. */

import { runner } from '../../../assets/js/ui/run.js';

export { legend, evidence, evidenceHtml, figure, svgButton } from '../../../assets/js/ui/figure.js';
export { densityBars, curve, histogram } from '../../../assets/js/ui/plot.js';
export { compareRow, COMPARE_HEAD } from '../../../assets/js/ui/lab.js';
export { sig } from '../../../assets/js/ui/format.js';

export const SIM = 'var(--s1)', THEORY = 'var(--s2)', INK = 'var(--ink)', MUTED = 'var(--muted)';

/** ${hw}'s experiments, run in its worker with a per-page cache (shared runner). */
export const { getRun, forget, pending, updatingFlag } = runner(new URL('../workers/sim.js', import.meta.url));
`;

const experimentsJs = () => `/* experiments.js — the Monte Carlo experiments of ${hw}, run in the worker
   (js/workers/sim.js). Pure, no DOM: runs under Node too, so each one can be
   checked against its reference values in a scratch script.
   Each experiment takes plain arguments plus onProgress and returns plain
   data (typed arrays are handed to the page without copying). */

import { SeededRng } from '../../../assets/js/core/rng.js';
import { moments, compare } from '../../../assets/js/core/stats.js';

/** One id per experiment, so each draws an independent stream from the same seed. */
export const ID = { example: 1 };

/** An independent generator for one experiment: (seed ⊕ id·φ) through the
 *  splitmix32 seeding of SeededRng, so nearby ids give unrelated streams. */
export const stream = (seed, id, sub = 0) => new SeededRng((seed ^ Math.imul(id * 1000 + sub + 1, 0x9e3779b9)) >>> 0);

/** Example: R samples of n draws from U(0, 1); the sample means against μ = ½.
 *  Category: simulation. Replace it with the homework's own experiments. */
export function example({ n, R, seed, onProgress = () => {} }) {
  const rng = stream(seed, ID.example);
  const means = new Float64Array(R);
  for (let r = 0; r < R; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += rng.float();
    means[r] = s / n;
    if ((r & 1023) === 0) onProgress(r / R);
  }
  const mom = moments(means);
  return { n, R, means, mean: compare(mom.mean, 0.5, mom.seMean) };
}
`;

const workerJs = () => `/* sim.js — the Web Worker that runs ${hw}'s experiments, so the page stays
   responsive. Message in: {kind, args} (kind names a function of
   core/experiments.js, args its plain arguments). Messages out
   (assets/js/ui/worker.js protocol): {type: 'progress', value},
   {type: 'done', result}, {type: 'error', message}. */

import * as X from '../core/experiments.js';

const KINDS = { example: X.example };

/* every typed array in the result, so they are handed over rather than copied */
function buffers(v, out = []) {
  if (ArrayBuffer.isView(v)) out.push(v.buffer);
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) buffers(v[k], out);
  return out;
}

self.onmessage = ({ data }) => {
  try {
    const run = KINDS[data.kind];
    if (!run) throw new Error(\`unknown experiment \${data.kind}\`);
    const result = run({ ...data.args, onProgress: (value) => self.postMessage({ type: 'progress', value }) });
    self.postMessage({ type: 'done', result }, [...new Set(buffers(result))]);
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};
`;

const homeJs = () => `/* home-page.js — the ${hw} home page: the honesty note, the exercise, the
   modelling decisions, and the pages in reading order (from PAGES in shell.js).
   The home page has no dock. */

import { el, explain, pageList } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { m } from '../../../assets/js/ui/math.js';
import { ${hw}Shell, PAGES, STICKY, MEMORY, NOTICE } from './shell.js';

function exercise() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The exercise' }),
    el('p', { html: \`The assignment, in the professor’s words or close to them, formulas as \${m\`\\bar x_n\`}.\` }),
  ]);
}

function decisions() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'How the model reads the exercise' }),
    el('ul', {}, [el('li', { html: '<strong>A decision.</strong> And why it was taken.' })]),
    explain(['Why these decisions, in two to four sentences.']),
  ]);
}

const shell = ${hw}Shell('index.html');

startPage({
  shell,
  sticky: STICKY,
  memory: MEMORY,
  // the honesty note sits at the top only when there is no footer to carry it (hw04, hw05)
  render: () => [shell.footer === false ? el('p', { class: 'notice', text: NOTICE }) : null, exercise(), decisions(), pageList(PAGES)],
});
`;

const pageJs = (slug) => `/* ${slug}-page.js — what this page shows, in two to four lines. */

import { el, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { readInputs, dock, rejected } from './inputs.js';
import { ${hw}Shell, STICKY, MEMORY } from './shell.js';

/* this page's own row in the dock (leave it out if the page has none) */
const OWN = {
  id: '${slug}', label: 'this page',
  build(apply) {
    const box = el('input', { type: 'checkbox', onchange: (e) => apply({ detail: e.target.checked ? '1' : null }) });
    return {
      nodes: [el('div', { class: 'row' }, [el('label', { class: 'small' }, [box, ' show the detail'])])],
      refresh(v) { box.checked = v.detail; },
    };
  },
  summary: (v) => (v.detail ? 'detail on' : ''),
};

function examplePanel(inputs) {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'A panel' }),
    el('div', { html: M\`\\bar x_n = \\frac{1}{n}\\sum_{i=1}^{n} x_i\` }),
    el('p', { class: 'small muted', html: \`Replace this with the real thing (now \${m\`n = \${inputs.n}\`}).\` }),
    explain([
      'What the reader is looking at, in two to four sentences.',
      'PRACTICE: where this shows up in the real world — be specific, or leave it out.',
    ]),
  ]);
}

startPage({
  shell: ${hw}Shell('${slug}.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,   // redraw in place: keep the scroll and the open boxes when an input changes
  render: ({ state, update }) => {
    const inputs = readInputs(state);
    dock(inputs, update, OWN, { detail: state.detail === '1' });
    if (inputs.error) return [rejected(inputs.error)];
    return [examplePanel(inputs)];
  },
});
`;

const labJs = (slug) => `/* ${slug}-page.js — what this experiment measures, in two to four lines.
   The panel reads in the fixed order of assets/js/ui/lab.js; the simulation
   runs in the worker (core/experiments.js → workers/sim.js) through the
   runner in widgets.js, so the previous result stays on screen while a new
   one computes. This file only draws. */

import { el } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { nice } from '../../../assets/js/ui/format.js';
import { m } from '../../../assets/js/ui/math.js';
import { readInputs, dock, rejected } from './inputs.js';
import { compareRow, COMPARE_HEAD, histogram, figure, legend, sig, SIM, THEORY, getRun, pending, updatingFlag } from './widgets.js';
import { ${hw}Shell, STICKY, MEMORY } from './shell.js';

const R = 10000;

function experiment(inputs, redraw) {
  const spec = { kind: 'example', args: { n: inputs.n, R, seed: inputs.seed } };
  const got = getRun(spec, redraw, 'E1');
  return labPanel({
    hw: '${hw}', id: 'E1', title: 'E1 · The experiment', name: \`E1-n\${inputs.n}-seed\${inputs.seed}\`,
    question: 'The question the experiment answers, in one sentence.',
    steps: [
      \`draw \${nice(R)} samples of \${m\`n = \${inputs.n}\`} values from U(0, 1) (seed \${inputs.seed});\`,
      \`compute each sample mean \${m\`\\bar x\`};\`,
      \`compare their average with \${m\`\\mu = 1/2\`}, in units of its standard error.\`,
    ],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const res = got.result;
      const sd = Math.sqrt(1 / 12 / res.n);
      const hist = histogram({
        values: res.means, lo: 0.5 - 4 * sd, hi: 0.5 + 4 * sd, xTitle: 'sample mean',
        curves: [{ f: (x) => Math.exp(-0.5 * ((x - 0.5) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI)), label: 'normal limit' }],
        label: 'histogram of the sample means against the normal limit',
      });
      return {
        answer: { text: \`The finding in one sentence, computed from the data: the average of the means is \${sig(res.mean.measured)} (z = \${res.mean.z.toFixed(2)}).\`, ok: res.mean.ok },
        body: [
          ...section(1, 'The sample means', 'How to read the figure.'),
          figure(hist),
          legend([['bar', SIM, 'simulation'], ['line', THEORY, 'normal limit']]),
          ...section(2, 'Measured against theory', 'z = difference / SE; "consistent" when |z| ≤ 3.'),
          table(COMPARE_HEAD, [compareRow(\`average of \${m\`\\bar x\`}\`, res.mean)]),
        ],
        rows: [{ n: res.n, R: res.R, mean: res.mean.measured, z: res.mean.z }],
        summary: { n: res.n, R: res.R, seed: inputs.seed },
      };
    },
    why: 'why the result matters.',
    notes: ['What am I looking at, in two to four sentences.'],
  });
}

startPage({
  shell: ${hw}Shell('${slug}.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,   // redraw in place: keep the scroll and the open boxes when an input changes
  render: (api) => {
    const inputs = readInputs(api.state);
    dock(inputs, api.update);
    if (inputs.error) return [rejected(inputs.error)];
    return [experiment(inputs, () => api.draw())];
  },
});
`;

const essayHtml = (title) => `${head(`Essay · ${title} · ${HW}`)}
<!-- Written from the author's notes (Obsidian vault, Courses/Statistics/…) and from the measured
     results of these pages. Measured numbers come from the default run (say which seed); rerun and
     update them if the code changes. -->
<main class="wrap">
<article class="essay">

  <h1>${title}</h1>
  <p class="byline">Subtitle · Statistics · MSc Cybersecurity, Sapienza · Homework ${Number(nn)}</p>

  <p class="lead">The argument in a paragraph. Formulas go in
    <code>&lt;span class="m"&gt;</code> (inline, e.g. <span class="m">\\bar x_n</span>) or
    <code>&lt;div class="M"&gt;</code> (display), in the TeX subset of math.js; renderMath typesets them.</p>

  <p class="evidence-key small">Each claim is labelled with its evidence:
    <span class="evidence theorem">theorem</span> proved in the notes, or an exact computation ·
    <span class="evidence measurement">measured</span> on these pages, with a link to the run ·
    <span class="evidence record">source</span> from the literature or the record ·
    <span class="evidence opinion">opinion</span> the author’s judgement.</p>

  <nav class="toc" aria-label="Contents">
    <ol>
      <li><a href="#intro">Introduction</a></li>
      <li><a href="#refs">References</a></li>
    </ol>
  </nav>

  <h2 id="intro">1. Introduction</h2>
  <p>A claim. <span class="evidence theorem">theorem</span></p>

  <h2 id="refs">References</h2>
  <ol class="refs">
    <li>…</li>
  </ol>

</article>
</main>
<script type="module">
  import { mountShell } from '../assets/js/ui/dom.js';
  import { renderMath } from '../assets/js/ui/math.js';
  import { ${hw}Shell } from './js/pages/shell.js';
  mountShell(${hw}Shell('essay.html'));
  renderMath(document.querySelector('.essay'));
</script>
</body>
</html>
`;

const needHw = () => {
  if (!existsSync(`${hw}/js/pages/shell.js`)) {
    console.error(`${hw} does not exist yet — run the "hw" command first.`);
    process.exit(1);
  }
};
const addToPages = (href, label) => console.log(`\nAdd it to PAGES in ${hw}/js/pages/shell.js:\n  { href: '${href}', label: '${label}', built: true,\n    blurb: 'One or two sentences for the home page.' },\n\nThen:  node tools/check.mjs ${hw}`);

if (command === 'hw') {
  const title = third ?? HW;
  const subtitle = fourth ?? '';
  put(`${hw}/css/${hw}.css`, `/* ${hw}.css — styles used only by this homework. Anything belonging to a\n   shared component (lab panels, essays, evidence labels, charts) lives in\n   assets/css/base.css. */\n`);
  put(`${hw}/js/pages/shell.js`, shellJs(title, subtitle));
  put(`${hw}/js/pages/inputs.js`, inputsJs());
  put(`${hw}/js/pages/widgets.js`, widgetsJs());
  put(`${hw}/js/core/experiments.js`, experimentsJs());
  put(`${hw}/js/workers/sim.js`, workerJs());
  put(`${hw}/js/pages/home-page.js`, homeJs());
  put(`${hw}/index.html`, pageHtml({ title: `${HW} · ${title}`, heading: title, slug: 'home',
    lead: 'What this homework is about, in two or three sentences.' }));
  console.log(`\nAdd a card for it to the hub in index.html:\n
  <div class="card">
    <h2><a href="${hw}/index.html">${HW} · ${title}</a></h2>
    <p>${subtitle}</p>
  </div>\n
Maths goes in ${hw}/js/core/ (pure, no DOM, runs under Node, documented for study);
experiments in core/experiments.js, registered in KINDS of js/workers/sim.js.
Then:  node tools/check.mjs ${hw}`);
} else if (command === 'page' || command === 'lab') {
  needHw();
  const slug = third;
  const heading = fourth ?? slug;
  put(`${hw}/${slug}.html`, pageHtml({ title: `${heading} · ${HW}`, heading, slug,
    lead: 'One or two sentences: what this page lets you do, and what to look at.' }));
  put(`${hw}/js/pages/${slug}-page.js`, command === 'lab' ? labJs(slug) : pageJs(slug));
  addToPages(`${slug}.html`, heading);
} else if (command === 'essay') {
  needHw();
  put(`${hw}/essay.html`, essayHtml(third ?? 'Essay'));
  addToPages('essay.html', 'Essay');
} else {
  console.error(readFileSync(new URL(import.meta.url)).toString().split('*/')[0].split('\n').slice(1).join('\n'));
  process.exit(2);
}
