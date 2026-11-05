/* math.js — formulas written in a small LaTeX subset and shown as native
   MathML, which every current browser renders (Chrome 109+, Firefox, Safari)
   with no library, no CDN and no network request. Also the same subset as
   SVG text with real sub- and superscripts, for labels inside drawings.

   Usage, inside an html string:   `the mean ${m`\bar x = \frac{1}{n}\sum x_i`} …`
   (m inline, M display); `m` is a tag, so backslashes need no escaping.
   Supported: letters (italic), numbers, operators, ^ and _ with {groups},
   \frac \sqrt \bar \hat \tilde \text \operatorname \mathbb, \sum \prod (large
   operators), \left( … \right), Greek letters, and the symbols in SYMBOLS.
   Anything else is shown as typed, so a typo is visible rather than silent. */

const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ',
  chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Omega: 'Ω',
};
const SYMBOLS = {
  cdot: '·', times: '×', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈',
  sim: '∼', equiv: '≡', to: '→', rightarrow: '→', mapsto: '↦', infty: '∞', in: '∈', ldots: '…', cdots: '⋯', mid: '∣',
  propto: '∝', partial: '∂', ell: 'ℓ', cup: '∪', cap: '∩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
  langle: '⟨', rangle: '⟩', vert: '|', Vert: '‖', prime: '′', circ: '∘', ast: '∗', star: '⋆', implies: '⟹', iff: '⟺',
  gg: '≫', ll: '≪', Longrightarrow: '⟹', Rightarrow: '⇒', leftarrow: '←', blacksquare: '∎', square: '□', bullet: '•',
};
const LARGE = { sum: '∑', prod: '∏', int: '∫' };
const SPACES = { ',': '0.17em', ';': '0.28em', ':': '0.22em', '!': '0em', quad: '1em', qquad: '2em', ' ': '0.28em' };   // \! (negative space) is drawn as no space
const ACCENTS = { bar: '‾', hat: '^', widehat: '^', widetilde: '~', tilde: '~', vec: '→', dot: '˙', overline: '‾' };   // ‾ (U+203E): two of them stack (x̄̄); ¯ did not
const BB = { E: '𝔼', R: 'ℝ', N: 'ℕ', Z: 'ℤ', P: 'ℙ', Q: 'ℚ' };
const OPS = '+-=<>()[],/|!:;.?*\'';
const RAW = new Set(['text', 'mathrm', 'operatorname', 'mathbb', 'mathbf']);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- a tiny parser: tokens → tree ---------- */

function tokenize(src) {
  const out = [];
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
      out.push({ t: 'cmd', v: m[1] });
      i += m[0].length;
      // the argument of \text-like commands is kept verbatim, spaces included
      if (RAW.has(m[1]) && src[i] === '{') {
        let depth = 1, j = i + 1;
        for (; j < src.length && depth; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; }
        out.push({ t: 'raw', v: src.slice(i + 1, j - 1) });
        i = j;
      }
    } else if (/\s/.test(c)) i++;
    else if (/[0-9]/.test(c)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i));
      out.push({ t: 'num', v: m[0] });
      i += m[0].length;
    } else { out.push({ t: 'chr', v: c }); i++; }
  }
  return out;
}

/** Parse a token list into nodes: {k: 'mi'|'mn'|'mo'|'mtext'|'row'|'frac'|'sqrt'|'acc'|'large'|'space'|'fence', …} */
function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const group = () => {   // one argument: {…} or a single atom
    const t = peek();
    if (t && t.t === 'chr' && t.v === '{') { p++; const kids = seq('}'); p++; return { k: 'row', kids }; }
    return atom();
  };
  const rawGroup = () => (peek()?.t === 'raw' ? tokens[p++].v : '');   // the verbatim argument of \text and kin
  function atom() {
    const t = tokens[p++];
    if (!t) return { k: 'row', kids: [] };
    if (t.t === 'num') return { k: 'mn', v: t.v };
    if (t.t === 'chr') {
      if (t.v === '{') { const kids = seq('}'); p++; return { k: 'row', kids }; }
      if (/[A-Za-z]/.test(t.v)) return { k: 'mi', v: t.v };
      if (t.v === '-') return { k: 'mo', v: '−' };
      if (t.v === '~') return { k: 'space', v: '0.28em' };
      if (OPS.includes(t.v)) return { k: 'mo', v: t.v, fence: '()[]|'.includes(t.v) };
      return { k: 'mi', v: t.v, upright: true };   // Unicode typed directly (μ, σ², …) stays as it is
    }
    const c = t.v;
    if (c === 'frac') { const a = group(), b = group(); return { k: 'frac', a, b }; }
    if (c === 'dfrac' || c === 'tfrac') { const a = group(), b = group(); return { k: 'frac', a, b }; }
    if (c === 'sqrt') return { k: 'sqrt', a: group() };
    if (ACCENTS[c]) return { k: 'acc', a: group(), v: ACCENTS[c], wide: c === 'overline' };
    if (c === 'text' || c === 'mathrm') return { k: 'mtext', v: rawGroup() };
    if (c === 'operatorname') return { k: 'mi', v: rawGroup(), upright: true, op: true };
    if (c === 'mathbb') { const s = rawGroup(); return { k: 'mi', v: [...s].map((ch) => BB[ch] ?? ch).join(''), upright: true }; }
    if (c === 'mathbf') return { k: 'mi', v: rawGroup(), bold: true };
    if (c === 'left' || c === 'right' || c === 'big' || c === 'Big') {
      const f = tokens[p++];
      const v = f ? (f.t === 'cmd' ? SYMBOLS[f.v] ?? f.v : f.v) : '';
      return v === '.' ? { k: 'row', kids: [] } : { k: 'mo', v, fence: true, stretchy: c === 'left' || c === 'right' };
    }
    if (GREEK[c]) return { k: 'mi', v: GREEK[c], upright: /^[A-Z]/.test(c) };
    if (LARGE[c]) return { k: 'large', v: LARGE[c] };
    if (SYMBOLS[c]) return { k: 'mo', v: SYMBOLS[c] };
    if (SPACES[c]) return { k: 'space', v: SPACES[c] };
    if (c === '{' || c === '}' || c === '%' || c === '#' || c === '&' || c === '_' || c === '$') return { k: 'mo', v: c };
    if (['log', 'ln', 'exp', 'min', 'max', 'sin', 'cos', 'lim', 'det', 'sup', 'inf', 'arg'].includes(c)) return { k: 'mi', v: c, upright: true, op: true };
    return { k: 'mtext', v: `\\${c}` };   // unknown: shown as typed
  }
  function seq(stop) {
    const kids = [];
    while (p < tokens.length && !(stop && tokens[p].t === 'chr' && tokens[p].v === stop)) {
      let base = atom();
      let sub = null, sup = null;
      for (;;) {
        const t = peek();
        if (t?.t === 'chr' && t.v === '_') { p++; sub = group(); }
        else if (t?.t === 'chr' && t.v === '^') { p++; sup = group(); }
        else if (t?.t === 'chr' && t.v === "'") { p++; sup = { k: 'mo', v: '′' }; }
        else break;
      }
      if (sub || sup) base = { k: 'script', base, sub, sup };
      // a sign at the start, or right after another operator, is unary: no operator spacing (κ = −0.12)
      const prev = kids.at(-1);
      if (base.k === 'mo' && (base.v === '−' || base.v === '+') && (!prev || (prev.k === 'mo' && !')]|'.includes(prev.v)))) base.prefix = true;
      kids.push(base);
    }
    return kids;
  }
  return seq(null);
}

/* ---------- tree → MathML ---------- */

function ml(n, display) {
  switch (n.k) {
    case 'mi': {
      const variant = n.bold ? ' mathvariant="bold"' : n.upright || [...n.v].length > 1 ? ' mathvariant="normal"' : '';
      return `<mi${variant}>${esc(n.v)}</mi>${n.op ? '<mo>&#x2061;</mo>' : ''}`;
    }
    case 'mn': return `<mn>${esc(n.v)}</mn>`;
    case 'mo': return `<mo${n.fence ? ` stretchy="${n.stretchy ? 'true' : 'false'}"` : ''}${n.v === '/' || n.v === '|' ? ' lspace="0" rspace="0"' : ''}${n.prefix ? ' form="prefix"' : ''}>${esc(n.v)}</mo>`;
    case 'mtext': {
      // MathML trims spaces at the ends of a text run: keep them as real spaces
      const lead = /^\s/.test(n.v) ? '<mspace width="0.28em"></mspace>' : '', trail = /\s$/.test(n.v) ? '<mspace width="0.28em"></mspace>' : '';
      return `${lead}<mtext>${esc(n.v.trim())}</mtext>${trail}`;
    }
    case 'space': return `<mspace width="${n.v}"></mspace>`;
    case 'row': return `<mrow>${n.kids.map((k) => ml(k, display)).join('')}</mrow>`;
    case 'frac': return `<mfrac>${ml(n.a, display)}${ml(n.b, display)}</mfrac>`;
    case 'sqrt': return `<msqrt>${ml(n.a, display)}</msqrt>`;
    case 'acc': return `<mover accent="true">${ml(n.a, display)}<mo stretchy="${n.wide ? 'true' : 'false'}">${esc(n.v)}</mo></mover>`;
    case 'large': return `<mo largeop="true" movablelimits="true">${esc(n.v)}</mo>`;
    case 'script': {
      const b = ml(n.base, display);
      const large = n.base.k === 'large' && display;
      if (n.sub && n.sup) return large ? `<munderover>${b}${ml(n.sub, display)}${ml(n.sup, display)}</munderover>` : `<msubsup>${b}${ml(n.sub, display)}${ml(n.sup, display)}</msubsup>`;
      if (n.sub) return large ? `<munder>${b}${ml(n.sub, display)}</munder>` : `<msub>${b}${ml(n.sub, display)}</msub>`;
      return large ? `<mover>${b}${ml(n.sup, display)}</mover>` : `<msup>${b}${ml(n.sup, display)}</msup>`;
    }
    default: return '';
  }
}

/** MathML markup for a formula in the LaTeX subset.
 *  @param {string} src  @param {boolean} [display]  a centred block instead of inline */
export function tex(src, display = false) {
  const body = parse(tokenize(src)).map((n) => ml(n, display)).join('');
  return `<math${display ? ' display="block"' : ''}><mrow>${body}</mrow></math>`;
}

const raw = (strings, vals) => strings.raw.reduce((s, part, i) => s + part + (i < vals.length ? vals[i] : ''), '');
/** Inline formula, as a tag: m`\bar x_j` (values may be interpolated: m`n = ${n}`). */
export const m = (strings, ...vals) => tex(raw(strings, vals), false);
/** Display formula, as a tag: M`S_k = S_{k-1} + d_k (x_k - M_k)`.
 *  Several lines, as LaTeX's align*: separate them with \\ and put & before the
 *  sign to align on, e.g. M`a &= b + c \\ &= d`. Long chains then fit a phone. */
export const M = (strings, ...vals) => {
  const src = raw(strings, vals);
  if (!src.includes('\\\\')) return `<div class="math-block">${tex(src, true)}</div>`;
  // one grid row per line, two columns meeting at the &: MathML's own table cannot right-align a column
  const cells = src.split('\\\\').flatMap((line) => {
    const [left, ...right] = line.split('&');
    return right.length ? [`<span class="l">${tex(left)}</span>`, `<span class="r">${tex(right.join(''))}</span>`] : [`<span class="l"></span>`, `<span class="r">${tex(left)}</span>`];
  });
  return `<div class="math-block math-lines">${cells.join('')}</div>`;
};

/* ---------- the same subset as SVG text ---------- */

/** Fill an SVG <text> node with the formula: italic letters, upright digits and
 *  operators, and real sub/superscripts (smaller, shifted tspans). Fractions and
 *  roots are written inline (a/b, √x): an SVG label has one line. */
export function svgTex(textNode, src) {
  const NS = 'http://www.w3.org/2000/svg';
  const span = (str, cls, shift = null) => {
    const t = document.createElementNS(NS, 'tspan');
    if (cls) t.setAttribute('class', cls);
    if (shift) { t.setAttribute('baseline-shift', shift); t.setAttribute('font-size', '75%'); }
    t.textContent = str;
    return t;
  };
  const flat = (n, shift) => {
    switch (n.k) {
      case 'mi': return [span(n.v, n.upright || [...n.v].length > 1 ? null : 'mi', shift)];
      case 'mn': case 'mtext': return [span(n.v, null, shift)];
      case 'mo': return [span(['=', '+', '−', '≤', '≥', '≈', '→', '×', '·'].includes(n.v) ? ` ${n.v} ` : n.v, null, shift)];
      case 'space': return [span(' ', null, shift)];
      case 'row': return n.kids.flatMap((k) => flat(k, shift));
      case 'frac': {
        // one line: a/b, with parentheses around a compound numerator or denominator
        const part = (x) => (x.k === 'row' && x.kids.length > 1 ? [span('(', null, shift), ...flat(x, shift), span(')', null, shift)] : flat(x, shift));
        return [...part(n.a), span('/', null, shift), ...part(n.b), span(' ', null, shift)];
      }
      case 'sqrt': return [span('√', null, shift), ...flat(n.a, shift)];
      case 'acc': return [...flat(n.a, shift), span(n.v === '‾' ? '̄' : n.v, null, shift)];
      case 'large': return [span(n.v, null, shift)];
      case 'script': {
        // a script inside a script is drawn at the same smaller size (one level is enough for labels)
        const out = [...flat(n.base, shift)];
        if (n.sub) out.push(...flat(n.sub, 'sub'));
        if (n.sup) out.push(...flat(n.sup, 'super'));
        return out;
      }
      default: return [];
    }
  };
  textNode.replaceChildren(...parse(tokenize(src)).flatMap((n) => flat(n, null)));
  return textNode;
}

/** Typeset a static page: every element with class "m" (inline) or "M" (display)
 *  holds its formula as text and is replaced by the MathML. For the essays,
 *  which are plain HTML; write < and & in the formula as &lt; and &amp;. */
export function renderMath(root = document) {
  for (const node of root.querySelectorAll('.m, .M')) {
    const src = node.textContent;
    const display = node.classList.contains('M');
    const wrap = document.createElement(display ? 'div' : 'span');
    wrap.innerHTML = display ? M(Object.assign([src], { raw: [src] })) : tex(src);   // M is a tag: hand it a raw strings array
    node.replaceWith(...wrap.childNodes);
  }
}
