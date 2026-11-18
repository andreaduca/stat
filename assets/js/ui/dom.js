/* dom.js — the small DOM vocabulary every page in this repo shares:
   element building, the page shell (header + nav + footer), and the
   collapsible "What am I looking at?" box. No maths lives here. */

import { SITE } from './site.js';

/** Build an element. `props` sets attributes, except `class`/`text`/`html`
 *  and `on*` handlers. `kids` may be nodes or strings. */
export function el(tag, props = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const kid of [].concat(kids)) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

/** Replace the children of a node. */
export function fill(node, kids) {
  node.replaceChildren(...[].concat(kids).filter(Boolean));
  return node;
}

/** Header with title and tab nav, plus the footer carrying the homework's
 *  honesty notice and the credits. Called once per page: `links` is
 *  [{href, label}], `current` marks the active tab, and `notice` is the
 *  warning that belongs on every page of that homework. `footer: false`
 *  leaves the footer out entirely (hw02 asked for that). */
export function mountShell({ title, subtitle, links = [], current = '', home = '../index.html', notice = '', footer: withFooter = true }) {
  const header = el('header', { class: 'site-header' }, [
    el('div', { class: 'inner' }, [
      el('div', { class: 'site-brand' }, [
        el('p', { class: 'site-title' }, [el('a', { href: home, text: title })]),
        subtitle ? el('p', { class: 'site-sub', text: subtitle }) : null,
      ]),
      el('nav', { class: 'tabs' }, links.map(l =>
        el('a', { href: l.href, text: l.label, 'aria-current': l.href === current ? 'page' : null }))),
    ]),
  ]);
  const credits = `${SITE.author} · ${SITE.course}`;
  const footer = el('footer', { class: 'site-footer' }, [
    el('div', { class: 'inner' }, [
      notice ? el('p', { class: 'notice', text: notice }) : null,
      el('p', { html: SITE.sourceUrl ? `${credits} · <a href="${SITE.sourceUrl}">source</a>` : credits }),
    ]),
  ]);

  document.body.prepend(header);
  if (withFooter) document.body.append(footer);
}

/** The "What am I looking at?" box: the maths of a panel, and why it matters.
 *  A paragraph beginning with "PRACTICE:" is marked as a real-world note. */
export function explain(paragraphs, summary = 'What am I looking at?') {
  return el('details', { class: 'explain' }, [
    el('summary', { text: summary }),
    el('div', {}, [].concat(paragraphs).map((text) => {
      const practice = text.startsWith('PRACTICE:');
      return el('p', { class: practice ? 'practice' : null, html: practice ? text.slice(9).trim() : text });
    })),
  ]);
}

/** <label> wrapping a control, so forms stay one call per field. */
export function field(label, control) {
  return el('label', { class: 'field' }, [el('span', { text: label }), control]);
}

/** Label → value rows (labels may hold markup, values are plain text). */
export const facts = (rows) => el('ul', { class: 'facts' }, rows.filter(Boolean).map(([k, v]) =>
  el('li', {}, [el('span', { class: 'k', html: k }), el('span', { class: 'v', text: v })])));

/* fmt lives with the other formatters in format.js; re-exported for the pages that import it from here */
export { fmt } from './format.js';

/** A link to one of a homework's pages as HTML, or plain text while that page
 *  is not built yet. @param {{href, built}[]} pages  the homework's PAGES */
export const pageLink = (pages, href, text) => (pages.find((p) => p.href === href)?.built ? `<a href="${href}">${text}</a>` : text);

/** The home page's list of pages in reading order, from PAGES (each {href, label, built, blurb}). */
export const pageList = (pages, heading = 'The pages, in reading order') => el('div', { class: 'card' }, [
  el('h2', { text: heading }),
  el('ul', { class: 'pagelist' }, pages.filter((p) => p.blurb).map((p) => el('li', {}, [
    p.built ? el('a', { href: p.href }, [el('strong', { text: p.label })]) : el('strong', { class: 'muted', text: `${p.label} (to be built)` }),
    ' ', p.blurb,
  ]))),
]);

/**
 * The abstract that opens every page (hw06 on; user's request, 11 Nov 2026): the question
 * the page answers, what it finds (with the key numbers), and its sections as links.
 * @param {{question: string, findings: string[], sections?: [string, string][], scope?: string}} o  html strings; sections are [id, title]; scope 'homework' on the home page
 */
export function abstract({ question, findings, sections = [], scope = 'page' }) {
  return el('section', { class: 'card abstract', 'aria-label': 'abstract' }, [
    el('h2', { text: 'Abstract' }),
    el('p', { class: 'abstract-q', html: question }),
    el('div', { class: 'label', text: `What this ${scope} finds` }),
    el('ul', {}, findings.map((f) => el('li', { html: f }))),
    sections.length ? el('div', { class: 'label', text: 'On this page' }) : null,
    sections.length ? el('ol', { class: 'abstract-toc' }, sections.map(([id, t]) => el('li', {}, [el('a', { href: `#${id}`, text: t })]))) : null,
  ]);
}

/** Give a panel an id, so the abstract can link to it. */
export const anchor = (id, node) => { node.id = id; return node; };
