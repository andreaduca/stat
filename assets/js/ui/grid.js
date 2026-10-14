/* grid.js — SVG scatter plot on the integer lattice {0..p-1} x {0..p-1}.
   Knows about axes, dots, overlay markers, segments and hover snapping;
   knows nothing about elliptic curves, so any modular-arithmetic picture
   can reuse it. Coordinates are mathematical: y grows upward. */

const SVG = 'http://www.w3.org/2000/svg';
const PAD = { l: 30, r: 10, t: 10, b: 24 };

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

export class LatticeGrid {
  /** `onHover(pt)` returns tooltip text (or null); `onPick(pt)` handles clicks.
   *  Both receive {x, y} Numbers, and only for lattice sites that hold a point. */
  constructor({ modulus, size = 520, onHover = null, onPick = null } = {}) {
    this.size = size;
    this.onHover = onHover;
    this.onPick = onPick;
    this.keys = new Set();

    this.svg = svgEl('svg', { viewBox: `0 0 ${size + PAD.l + PAD.r} ${size + PAD.t + PAD.b}` });
    this.gAxis = svgEl('g');
    this.gBase = svgEl('g');
    this.gMark = svgEl('g');
    this.svg.append(this.gAxis, this.gBase, this.gMark);

    this.tipNode = document.createElement('div');
    this.tipNode.className = 'tip';
    this.element = document.createElement('div');
    this.element.className = 'plot';
    this.element.append(this.svg, this.tipNode);

    this.svg.addEventListener('pointermove', (e) => this._move(e));
    this.svg.addEventListener('pointerleave', () => this.hideTip());
    this.svg.addEventListener('click', (e) => {
      const pt = this._nearest(e);
      if (pt && this.onPick) this.onPick(pt);
    });

    this.setModulus(modulus);
  }

  setModulus(p) {
    this.p = Number(p);
    this.step = this.size / Math.max(1, this.p - 1);           // lattice spacing in px
    this.r = Math.max(1.1, Math.min(4.5, 85 / this.p));        // dot radius shrinks with p
    this._axes();
    this.setPoints([]);
    this.clearMarks();
  }

  /* px position of a lattice site; y is flipped so the plot reads like a graph */
  screen({ x, y }) {
    return { cx: PAD.l + Number(x) * this.step, cy: PAD.t + this.size - Number(y) * this.step };
  }

  _axes() {
    const p = this.p, s = this.size;
    const frame = [
      svgEl('line', { class: 'axis', x1: PAD.l, y1: PAD.t, x2: PAD.l, y2: PAD.t + s }),
      svgEl('line', { class: 'axis', x1: PAD.l, y1: PAD.t + s, x2: PAD.l + s, y2: PAD.t + s }),
    ];
    // y = p/2 is the symmetry line: P and -P sit at equal distance from it
    const mid = this.screen({ x: 0, y: p / 2 }).cy;
    frame.push(svgEl('line', { class: 'mirror', x1: PAD.l, y1: mid, x2: PAD.l + s, y2: mid }));

    const every = Math.max(1, Math.ceil(p / 18));
    for (let i = 0; i < p; i += every) {
      const { cx, cy } = this.screen({ x: i, y: i });
      frame.push(svgEl('text', { class: 'lbl', x: cx, y: PAD.t + s + 15, 'text-anchor': 'middle' }));
      frame.at(-1).textContent = i;
      frame.push(svgEl('text', { class: 'lbl', x: PAD.l - 6, y: cy + 4, 'text-anchor': 'end' }));
      frame.at(-1).textContent = i;
    }
    this.gAxis.replaceChildren(...frame);
  }

  /** The dots: every point of the set being shown. */
  setPoints(points) {
    this.keys = new Set(points.map((pt) => `${pt.x},${pt.y}`));
    this.gBase.replaceChildren(...points.map((pt) => {
      const { cx, cy } = this.screen(pt);
      return svgEl('circle', { class: 'pt', cx, cy, r: this.r });
    }));
  }

  clearMarks() { this.gMark.replaceChildren(); }

  /** Highlight sites with a role colour: operand | line | third | result | base. */
  mark(points, kind) {
    const r = kind === 'line' ? Math.max(1.6, this.r * 1.1) : Math.max(3.4, this.r * 1.7);
    return [].concat(points).filter(Boolean).map((pt) => {
      const { cx, cy } = this.screen(pt);
      const node = svgEl('circle', { class: `m-${kind}`, cx, cy, r });
      this.gMark.append(node);
      return node;
    });
  }

  /** A straight segment in lattice coordinates (used for the vertical case). */
  segment(from, to, cls = 'mirror') {
    const a = this.screen(from), b = this.screen(to);
    const node = svgEl('line', { class: cls, x1: a.cx, y1: a.cy, x2: b.cx, y2: b.cy });
    this.gMark.append(node);
    return node;
  }

  /** Slide a marker from one site to another — the reflection R -> -R. */
  flip(node, from, to, ms = 600) {
    const dy = this.screen(to).cy - this.screen(from).cy;
    node.classList.add('moving');
    node.style.setProperty('--flip', `${ms}ms`);
    requestAnimationFrame(() => { node.style.transform = `translateY(${dy}px)`; });
  }

  showTip(pt, text) {
    const { cx, cy } = this.screen(pt);
    const box = this.svg.getBoundingClientRect();
    const sx = box.width / (this.size + PAD.l + PAD.r);
    this.tipNode.textContent = text;
    this.tipNode.style.left = `${cx * sx}px`;
    this.tipNode.style.top = `${cy * sx}px`;
    this.tipNode.classList.add('on');
  }

  hideTip() { this.tipNode.classList.remove('on'); }

  /* Snap the pointer to the closest lattice site, but only report it if a
     point actually lives there — cheaper and steadier than per-dot handlers. */
  _nearest(event) {
    const box = this.svg.getBoundingClientRect();
    const sx = (this.size + PAD.l + PAD.r) / box.width;
    const ux = (event.clientX - box.left) * sx;
    const uy = (event.clientY - box.top) * sx;
    const x = Math.round((ux - PAD.l) / this.step);
    const y = Math.round((PAD.t + this.size - uy) / this.step);
    if (x < 0 || y < 0 || x >= this.p || y >= this.p) return null;
    const near = Math.hypot(ux - this.screen({ x, y }).cx, uy - this.screen({ x, y }).cy);
    if (near > Math.max(8, this.step * 0.6)) return null;
    return this.keys.has(`${x},${y}`) ? { x, y } : null;
  }

  _move(event) {
    if (!this.onHover) return;
    const pt = this._nearest(event);
    const text = pt ? this.onHover(pt) : null;
    if (text) this.showTip(pt, text); else this.hideTip();
  }
}

/** Colour key for the marker roles, so every plot explains itself. */
export function legend(items) {
  const wrap = document.createElement('div');
  wrap.className = 'legend';
  for (const [kind, label] of items) {
    const span = document.createElement('span');
    span.innerHTML = `<i style="background:var(--c-${kind})"></i>${label}`;
    wrap.append(span);
  }
  return wrap;
}
