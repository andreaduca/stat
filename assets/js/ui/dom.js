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

/** Thousands separator for BigInt/Number, keeping tables readable. */
export const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
