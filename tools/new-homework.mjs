/* new-homework.mjs — scaffold the next homework, or another page inside one,
   already wired to the shared shell. Writes files and never overwrites.
   Development tool: it generates the deliverable, it is not part of it.

   node tools/new-homework.mjs hw   02 "Title shown in the header" "subtitle"
   node tools/new-homework.mjs page 02 entropy "Heading of the page"
*/

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , command, nn, third, fourth] = process.argv;
const hw = `hw${nn}`;

const put = (path, body) => {
  if (existsSync(path)) { console.log(`kept    ${path} (already exists)`); return; }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  console.log(`created ${path}`);
};

/** The overview page is prose, so it mounts the shell inline instead of
 *  carrying a page module. */
const homeHtml = ({ title, heading }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="../assets/css/base.css">
<link rel="stylesheet" href="css/${hw}.css">
</head>
<body>
<main class="wrap">
  <h1>${heading}</h1>
  <p class="lead">What this homework is about, in two or three sentences.</p>
</main>
<script type="module">
  import { mountShell } from '../assets/js/ui/dom.js';
  import { ${hw}Shell } from './js/pages/shell.js';
  mountShell(${hw}Shell('index.html'));
</script>
</body>
</html>
`;

const pageHtml = ({ title, heading, slug }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="../assets/css/base.css">
<link rel="stylesheet" href="css/${hw}.css">
</head>
<body>
<main class="wrap">
  <h1>${heading}</h1>
  <p class="lead">One or two sentences: what this page lets you do, and what to look at.</p>
  <div id="app"></div>
</main>
<script type="module" src="js/pages/${slug}-page.js"></script>
</body>
</html>
`;

const pageModule = (slug) => `/* ${slug}-page.js — what this page shows, in two to four lines.
   Panels are built here; shared controls come from the shell. */

import { el, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { ${hw}Shell } from './shell.js';

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
  sticky: [],          // parameters that should follow the reader between pages
  memory: null,        // e.g. '${hw}.current' once there is something to remember
  render: ({ state, update }) => [examplePanel(state, update)],
});
`;

if (command === 'hw') {
  const title = third ?? `HW${nn}`;
  const subtitle = fourth ?? '';
  put(`${hw}/css/${hw}.css`, `/* ${hw}.css — styles used only by this homework. Anything belonging to a\n   shared component lives in assets/css/base.css. */\n`);
  put(`${hw}/js/pages/shell.js`, `/* shell.js — what the header, the tab bar and the footer say on every page
   of this homework. One place to add a page to the navigation. */

const LINKS = [
  { href: 'index.html', label: 'Overview' },
];

/** Shell arguments for one page of ${hw}. @param {string} current its filename */
export const ${hw}Shell = (current) => ({
  title: 'HW${nn} · ${title}',
  subtitle: '${subtitle}',
  links: LINKS,
  current,
  home: '../index.html',
  notice: 'Educational toy. Nothing leaves your browser.',
});
`);
  put(`${hw}/index.html`, homeHtml({ title: `HW${nn} · ${title}`, heading: title }));
  console.log(`\nAdd a card for it to the hub in index.html:\n
  <div class="card">
    <h2><a href="${hw}/index.html">HW${nn} · ${title}</a></h2>
    <p>${subtitle}</p>
  </div>\n
Then:  node tools/check.mjs ${hw}`);
} else if (command === 'page') {
  const slug = third;
  const heading = fourth ?? slug;
  if (!existsSync(`${hw}/js/pages/shell.js`)) {
    console.error(`${hw} does not exist yet — run the "hw" command first.`);
    process.exit(1);
  }
  put(`${hw}/${slug}.html`, pageHtml({ title: `${heading} · HW${nn}`, heading, slug }));
  put(`${hw}/js/pages/${slug}-page.js`, pageModule(slug));
  console.log(`\nAdd it to LINKS in ${hw}/js/pages/shell.js:\n  { href: '${slug}.html', label: '${heading}' },`);
} else {
  console.error(readFileSync(new URL(import.meta.url)).toString().split('*/')[0].split('\n').slice(1).join('\n'));
  process.exit(2);
}
