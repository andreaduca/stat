/* new-homework.mjs — scaffold the next homework, or a page inside one, already
   wired to the shared shell and following the pattern hw03/hw04 settled on:
   a PAGES list with blurbs, STICKY/MEMORY shared parameters, one input dock
   at the bottom of the window (assets/js/ui/dock.js) shared by every page, a
   home page that lists the pages, experiment panels from assets/js/ui/lab.js,
   and an essay.
   Writes files and never overwrites. Development tool, not part of the site.

   node tools/new-homework.mjs hw    05 "Title shown in the header" "subtitle"
   node tools/new-homework.mjs page  05 entropy "Heading of the page"
   node tools/new-homework.mjs lab   05 entropy "Heading of the page"   (a page with an experiment panel)
   node tools/new-homework.mjs essay 05 "Title of the essay"
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

/** The honesty note: in the footer of every page (and free to show elsewhere). */
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
export const STICKY = ['seed'];
export const MEMORY = '${hw}';
`;

const inputsJs = () => `/* inputs.js — the inputs every page of ${hw} shares, in the input dock at the
   bottom of the window (assets/js/ui/dock.js). They also read and validate
   the parameters from the page state, so every page agrees on the defaults.
   A page's own controls go in a section of its own (see the page template). */

import { el, field } from '../../../assets/js/ui/dom.js';
import { inputDock, show, onCommit } from '../../../assets/js/ui/dock.js';

/** The shared inputs, read from the page state with every value made valid. */
export function readInputs(state) {
  const seed = Math.max(0, Math.round(Number(state.seed) || 1));
  return { seed };
}

const SHARED = {
  id: 'shared',
  build(apply, later) {
    const seed = el('input', { type: 'number', class: 'num', min: 0, 'aria-label': 'seed' });
    const go = () => apply({ seed: seed.value });
    onCommit(seed, go, later);
    return {
      nodes: [el('div', { class: 'row' }, [
        field('seed', seed),
        el('button', { type: 'button', class: 'primary', text: 'Apply', onclick: go }),
      ])],
      refresh(v) { show(seed, v.seed); },
    };
  },
  summary: (v) => \`seed \${v.seed}\`,
  notes: ['<strong>seed</strong>: what it changes, in one or two sentences.'],
};

/**
 * Mount or refresh the dock; returns null, so it takes no place in the page.
 * @param {object|null} [page]  the page's own section, with its value as pageValue
 */
export const dock = (inputs, update, page = null, pageValue = null) => inputDock({
  id: '${hw}', title: 'Inputs', update,
  sections: page ? [SHARED, page] : [SHARED],
  values: { shared: inputs, ...(page ? { [page.id]: pageValue } : {}) },
});
`;

const homeJs = () => `/* home-page.js — the ${hw} home page: the exercise, the modelling decisions,
   and the pages in reading order (from PAGES in shell.js). */

import { el } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { ${hw}Shell, PAGES, STICKY, MEMORY } from './shell.js';

function exercise() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The exercise' }),
    el('p', { text: 'The assignment, in the professor’s words or close to them.' }),
  ]);
}

function pages() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The pages' }),
    el('ul', {}, PAGES.filter((p) => p.built && p.blurb).map((p) =>
      el('li', {}, [el('a', { href: p.href, text: p.label }), ' — ', p.blurb]))),
  ]);
}

startPage({
  shell: ${hw}Shell('index.html'),
  sticky: STICKY,
  memory: MEMORY,
  render: () => [exercise(), pages()],
});
`;

const pageJs = (slug) => `/* ${slug}-page.js — what this page shows, in two to four lines. */

import { el, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { readInputs, dock } from './inputs.js';
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

function examplePanel(state, update) {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'A panel' }),
    el('p', { class: 'small muted', text: 'Replace this with the real thing.' }),
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
    dock(readInputs(state), update, OWN, { detail: state.detail === '1' });
    return [examplePanel(state, update)];
  },
});
`;

const labJs = (slug) => `/* ${slug}-page.js — what this experiment measures, in two to four lines.
   The panel reads in the fixed order of assets/js/ui/lab.js. This one computes
   synchronously; a long run belongs in a Web Worker (assets/js/ui/worker.js,
   and hw04/js/pages/run.js for the cache and the in-place redraw). */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { nice } from '../../../assets/js/ui/format.js';
import { readInputs, dock } from './inputs.js';
import { ${hw}Shell, STICKY, MEMORY } from './shell.js';

function experiment(state, update) {
  const n = Math.min(1e6, Math.max(1, Math.round(Number(state.n) || 1000)));
  const input = el('input', { type: 'number', class: 'num', min: 1, max: 1e6, value: String(n),
    onchange: (e) => update({ n: e.target.value }) });
  return labPanel({
    hw: '${hw}', id: 'E1', title: 'The experiment',
    question: 'The question the experiment answers, in one sentence.',
    steps: ['first step of the procedure;', 'second step;', 'what is measured.'],
    controls: [field('n', input)],
    hints: ['<strong>n</strong> — what changing it does.'],
    view: () => ({
      answer: { text: \`The finding in one sentence, computed from the data (n = \${nice(n)}).\` },
      body: [...section(1, 'The numbers', 'How to read this table.'), table(['n', 'value'], [[nice(n), String(n)]])],
      rows: [{ n }],
    }),
    why: 'why the result matters.',
    notes: ['What am I looking at, in two to four sentences.'],
  });
}

startPage({
  shell: ${hw}Shell('${slug}.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,   // redraw in place: keep the scroll and the open boxes when an input changes
  render: ({ state, update }) => {
    dock(readInputs(state), update);
    return [experiment(state, update)];
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

  <p class="lead">The argument in a paragraph.</p>

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
  import { ${hw}Shell } from './js/pages/shell.js';
  mountShell(${hw}Shell('essay.html'));
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
  put(`${hw}/js/pages/home-page.js`, homeJs());
  put(`${hw}/index.html`, pageHtml({ title: `${HW} · ${title}`, heading: title, slug: 'home',
    lead: 'What this homework is about, in two or three sentences.' }));
  console.log(`\nAdd a card for it to the hub in index.html:\n
  <div class="card">
    <h2><a href="${hw}/index.html">${HW} · ${title}</a></h2>
    <p>${subtitle}</p>
  </div>\n
Maths goes in ${hw}/js/core/ (pure, no DOM, runs under Node).
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
