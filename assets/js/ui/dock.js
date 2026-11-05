/* dock.js — the input dock every homework uses: its inputs fixed to the bottom
   of the window, so they stay next to whatever chart is being watched, and
   foldable to a one-line summary (the choice is remembered per homework).
   Shared inputs come first; the page's own controls sit in a row of their own
   underneath. The dock is built once per page and lives outside #app, so a
   redraw never rebuilds it: the control in use keeps its focus, and only the
   summary, the message and the values that came from the URL are refreshed.
   First built for hw04 (user request, 28 Oct 2026), shared since 5 Nov 2026. */

import { el, explain } from './dom.js';
import { load, save } from './store.js';

let dock = null;

/* a value the reader is editing is never overwritten by a refresh */
export const editing = (node) => typeof document !== 'undefined' && document.activeElement === node;

/** Set a control's value from the state, unless the reader is using it. */
export const show = (node, value) => { if (!editing(node)) node.value = String(value); };

/**
 * A section of the dock.
 * @typedef {object} Section
 * @property {string} id
 * @property {string} [label]   a small heading above the row (the page's own row is labelled 'this page')
 * @property {(apply: (changes: object) => void, later: (fn: () => void) => void) => {nodes: Node[], refresh?: (value: any) => void}} build
 *           makes the controls, once; `apply` updates the page state, `later` runs fn after a
 *           short pause (so a few clicks on a number's arrows make one update)
 * @property {(value: any) => string} [summary]   this section's part of the one-line summary
 * @property {string[]} [notes]  its paragraphs in the "What does each value change?" box
 */

/**
 * Mount the dock on the first call, refresh it on every later one. Call it from
 * the page's render with the current values; it returns null, so it can sit in
 * the list of panels without taking a place in the page.
 * @param {object} o
 * @param {string} o.id        the homework ('hw04'): the folded state is kept as `${id}.dock.folded`
 * @param {string} o.title     the dock's name, shown at the left of the summary
 * @param {Section[]} o.sections  the shared inputs first, then the page's own
 * @param {object} o.values    {sectionId: value} handed to each section's refresh and summary
 * @param {(changes: object) => void} o.update   startPage's update
 * @param {{text: string, kind?: 'err'|'ok'}|null} [o.message]  one line under the summary
 *        (a rejected input, a confirmation); shown even when the dock is folded
 * @param {Node|null} [o.badge]  a node beside the title (hw02's safety label), replaced each time
 * @returns {null}
 */
export function inputDock({ id, title, sections, values, update, message = null, badge = null }) {
  if (!dock || dock.doc !== document) dock = build(id, title, sections);
  dock.update = update;
  dock.sections = sections;
  dock.values = { ...values };
  dock.badge.replaceChildren(...(badge ? [badge] : []));
  for (const s of sections) dock.parts[s.id]?.refresh?.(values[s.id]);
  summarise();
  dock.message.textContent = message?.text ?? '';
  dock.message.className = `dock-message small ${message?.kind ?? 'muted'}`;
  dock.message.hidden = !message;
  return null;
}

const summarise = () => {
  dock.summary.textContent = dock.sections.map((s) => s.summary?.(dock.values[s.id])).filter(Boolean).join(' · ');
};

/** Change one section's value without a redraw — for a control that updates the
 *  page live (a slider being dragged), so the summary follows it. */
export function setValue(sectionId, value) {
  if (!dock) return;
  dock.values[sectionId] = value;
  summarise();
}

function build(id, title, sections) {
  const foldKey = `${id}.dock.folded`;
  let timer = null;
  const apply = (changes) => { clearTimeout(timer); d.update(changes); };
  const later = (fn) => { clearTimeout(timer); timer = setTimeout(fn, 450); };

  const node = el('section', { class: 'card input-dock', 'aria-label': `${title} inputs` });
  const summary = el('span', { class: 'dock-summary' });
  const badgeNode = el('span', { class: 'dock-badge' });
  const message = el('p', { class: 'dock-message small', hidden: true, role: 'status' });
  const toggle = el('button', { type: 'button', class: 'mini dock-toggle', onclick: () => fold(!node.classList.contains('folded')) });
  const fold = (folded, remember = true) => {
    if (remember) save(foldKey, folded);
    if (folded) node.classList.add('folded'); else node.classList.remove('folded');
    toggle.textContent = folded ? '▴ Edit inputs' : '▾ Fold';
    toggle.setAttribute('aria-expanded', String(!folded));
  };

  const parts = {};
  const body = el('div', { class: 'dock-body' });
  sections.forEach((s, i) => {
    parts[s.id] = s.build(apply, later);
    body.append(el('div', { class: `dock-section${i ? ' sub' : ''}` }, [
      s.label ? el('div', { class: 'dock-label', text: s.label }) : null,
      ...parts[s.id].nodes,
    ]));
  });
  const notes = sections.flatMap((s) => s.notes ?? []);
  if (notes.length) body.append(explain(notes, 'What does each value change?'));

  node.append(el('div', { class: 'dock-head' }, [el('span', { class: 'dock-title', text: title }), badgeNode, summary, toggle]), message, body);
  const d = { node, summary, badge: badgeNode, message, parts, update: null, doc: document };
  // folded if the reader folded it; on a phone it starts folded, so it does not cover the page
  const stored = load(foldKey, null);
  fold(stored === null ? typeof innerWidth !== 'undefined' && innerWidth < 640 : stored === true, false);
  document.body.append(node);

  // room under the last card, so the dock never hides the end of the page
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { document.body.style.paddingBottom = `${node.offsetHeight + 24}px`; }).observe(node);
  }
  return d;
}

/** Wire a number (or text) input the dock way: arrows and leaving the field apply
 *  after a short pause, Enter applies at once. */
export function onCommit(input, go, later) {
  input.addEventListener('change', () => later(go));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.tagName !== 'TEXTAREA') go(); });
  return input;
}
