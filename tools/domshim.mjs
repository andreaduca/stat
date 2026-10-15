/* domshim.mjs — a DOM just large enough to run the page modules under Node.
   Development tool only: nothing here ships, and it is not a test framework.
   It exists so a page can be rendered and inspected without a browser. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

class El {
  constructor(tag) {
    this.tag = tag; this.children = []; this.attrs = {}; this.handlers = {};
    this._text = ''; this._html = '';
    const classes = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c),
    };
    this.style = { props: {}, setProperty: (k, v) => { this.style.props[k] = v; } };
  }
  set className(v) { this.attrs.class = v; }
  get className() { return this.attrs.class ?? ''; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this.text; }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  append(...kids) { this.children.push(...kids); }
  prepend(...kids) { this.children.unshift(...kids); }
  replaceChildren(...kids) { this.children = kids; }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  dispatch(type, event = {}) { (this.handlers[type] ?? []).forEach((fn) => fn(event)); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 560, height: 560 }; }
  remove() {}
  querySelector() { return null; }

  /** Depth-first search helpers, for inspecting what a page produced. */
  find(pred) {
    if (pred(this)) return this;
    for (const kid of this.children) {
      const hit = kid instanceof El ? kid.find(pred) : null;
      if (hit) return hit;
    }
    return null;
  }
  all(pred, out = []) {
    if (pred(this)) out.push(this);
    for (const kid of this.children) if (kid instanceof El) kid.all(pred, out);
    return out;
  }
  get text() {
    const own = this._text || this._html || '';
    return own + this.children.map((k) => (k instanceof El ? k.text : String(k.data ?? k))).join('');
  }
}

class TextNode {
  constructor(t) { this.data = String(t); }
  get textContent() { return this.data; }
  get text() { return this.data; }
}

/** Install a fresh document. Call once before importing each page module. */
export function installDom({ search = '', storage = {} } = {}) {
  const body = new El('body');
  const app = new El('div');
  app.setAttribute('id', 'app');
  body.append(app);

  globalThis.document = {
    body,
    createElement: (t) => new El(t),
    createElementNS: (_ns, t) => new El(t),
    createTextNode: (t) => new TextNode(t),
    getElementById: (id) => body.find((n) => n.id === id),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  globalThis.Node = El;
  globalThis.location = { search, pathname: '/page.html' };
  globalThis.history = { replaceState: () => {} };
  globalThis.requestAnimationFrame = (fn) => fn();
  globalThis.navigator ??= {};

  /* Pages fetch their data files relative to import.meta.url, which under Node
     is a file: URL that Node's own fetch refuses. Serve those from disk. */
  if (!globalThis.fetch.shimmed) {
    const nodeFetch = globalThis.fetch;
    globalThis.fetch = async (url) => (String(url).startsWith('file:')
      ? new Response(readFileSync(fileURLToPath(String(url))))
      : nodeFetch(url));
    globalThis.fetch.shimmed = true;
  }
  /* Experiments run in Web Workers; here a worker simply never answers. */
  globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} };

  const mem = new Map(Object.entries(storage));
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };

  return { body, app };
}
