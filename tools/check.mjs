/* check.mjs — build every page of a homework and report what came out, then
   check the HTML files that hold them together. A development aid, not a test
   suite: it checks that the pages build and that the shell is intact, never
   that the maths is right.

   Usage:  node tools/check.mjs hw01
           node tools/check.mjs hw01 '?curve=C2&k=7'
   Exit code 1 if a page throws, renders nothing, or loses part of its shell. */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installDom } from './domshim.mjs';

const hw = process.argv[2];
const search = process.argv[3] ?? '';
if (!hw) {
  console.error('usage: node tools/check.mjs <homework> [query string]');
  process.exit(2);
}

const dir = resolve(hw, 'js/pages');
const pages = readdirSync(dir).filter((f) => f.endsWith('-page.js')).sort();
let failures = 0;

for (const file of pages) {
  const { body, app } = installDom({ search });
  let error = null;
  try {
    await import(pathToFileURL(join(dir, file)).href);
  } catch (e) {
    error = e;
  }

  const cards = app.all((n) => n.className === 'card').length;
  const headings = app.all((n) => n.tag === 'h2').map((n) => n.text.trim());
  const errors = app.all((n) => n.className === 'err').map((n) => n.text.trim());
  const hasHeader = !!body.find((n) => n.className === 'site-header');
  const hasNav = !!body.find((n) => n.className === 'tabs');
  const hasNotice = !!body.find((n) => n.className === 'notice');

  const problems = [];
  if (error) problems.push(`threw: ${error.message}`);
  if (!error && cards === 0) problems.push('rendered no cards');
  if (!hasHeader) problems.push('no site header');
  if (!hasNav) problems.push('no navigation');
  if (!hasNotice) problems.push('no footer notice');   // the honesty note must be on every page

  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${hw}/${file}${search}`);
  console.log(`        cards ${cards} · ${headings.join(' | ') || '(no panels)'}`);
  for (const text of errors) console.log(`        shows error: ${text.slice(0, 90)}`);
  for (const p of problems) console.log(`        ${p}`);
  if (error?.stack) console.log(error.stack.split('\n').slice(1, 4).join('\n'));
  failures += problems.length ? 1 : 0;
}

/* The HTML files are not executed above, so check them statically: every page
   must load the stylesheet, point at a script that exists, and — for a page
   that mounts the shell inline, like an overview — import names that are
   really exported. A rename in shell.js silently breaking the navigation is
   exactly the kind of thing this catches. */
const htmlFiles = readdirSync(hw).filter((f) => f.endsWith('.html')).sort();
let htmlProblems = 0;

for (const file of htmlFiles) {
  const html = readFileSync(`${hw}/${file}`, 'utf8');
  const problems = [];

  if (!html.includes('assets/css/base.css')) problems.push('does not load base.css');

  const src = html.match(/<script[^>]*src="([^"]+)"/)?.[1];
  const inline = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];

  if (!src && !inline) problems.push('mounts nothing: no page module and no inline shell');
  if (src && !existsSync(`${hw}/${src}`)) problems.push(`script not found: ${src}`);

  /* follow each inline import and confirm the names exist in the target */
  for (const [, names, from] of (inline ?? '').matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)) {
    const target = from.startsWith('.') ? resolve(hw, from) : null;
    if (!target || !existsSync(target)) { problems.push(`import target missing: ${from}`); continue; }
    const source = readFileSync(target, 'utf8');
    for (const name of names.split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
      if (!new RegExp(`export\\s+(const|function|class|let)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`).test(source)) {
        problems.push(`imports {${name}} from ${from}, which does not export it`);
      }
    }
  }

  if (inline && !/mountShell\s*\(/.test(inline) && !src) problems.push('inline script never calls mountShell');

  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${hw}/${file}`);
  for (const p of problems) console.log(`        ${p}`);
  htmlProblems += problems.length ? 1 : 0;
}

console.log(`\n${pages.length - failures}/${pages.length} page modules built · ${htmlFiles.length - htmlProblems}/${htmlFiles.length} html files sound`);
process.exit(failures || htmlProblems ? 1 : 0);
