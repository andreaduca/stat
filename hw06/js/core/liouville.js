/* liouville.js — the algebra behind "Φ is not elementary", made checkable (E11).
   By Liouville's criterion, ∫ e^{−x²} dx is elementary iff R′ − 2xR = 1 has a
   rational solution R. This module takes a candidate R — a polynomial, or a
   polynomial plus one pole term c(x − a)^{−k} — computes R′ − 2xR exactly
   (coefficient arithmetic) and names the term that can never cancel.
   Pure, no DOM. Note 04 §2–3; [[Elementary functions and Liouville's theorem]]. */

/**
 * R′ − 2xR for R(x) = Σ_{j=0}^{d} p_j x^j + c (x − a)^{−k}.
 * Category: symbolic algebra (exact on the given coefficients).
 *
 * The two steps of the proof (note 04 §3), one per kind of term:
 *  • polynomial part, degree d with p_d ≠ 0: P′ has degree d − 1 and −2xP has degree d + 1
 *    with leading coefficient −2p_d ≠ 0. Nothing else reaches degree d + 1, so R′ − 2xR is a
 *    polynomial of degree d + 1 ≥ 1: never the constant 1.
 *  • pole term at a, order k ≥ 1: its derivative −kc(x − a)^{−k−1} has a pole of order k + 1;
 *    −2x·c(x − a)^{−k} = −2c(x − a)^{1−k} − 2ac(x − a)^{−k} has poles of order at most k. So the
 *    pole of order k + 1 survives with coefficient −kc ≠ 0: never the constant 1.
 * With both present, the pole cannot cancel against the polynomial and vice versa. Hence no
 * rational R exists [T], and erf is not elementary (the deep direction of the criterion is
 * Liouville–Rosenlicht 📌, Rosenlicht 1972 [S]).
 *
 * @param {number[]} p  polynomial coefficients p₀ … p_d (p[j] multiplies x^j)
 * @param {{c: number, a: number, k: number}|null} [pole]
 * @returns {{poly: number[], laurent: Map<number, number>, obstruction: object|null, equalsOne: boolean}}
 *          poly: coefficients of the polynomial part of R′ − 2xR; laurent: power (< 0) → coefficient in (x − a)
 */
export function residual(p, pole = null) {
  const d = lastNonZero(p);
  const poly = new Array(Math.max(d + 2, 1)).fill(0);
  for (let j = 1; j <= d; j++) poly[j - 1] += j * p[j];          // P′
  for (let j = 0; j <= d; j++) poly[j + 1] -= 2 * p[j];          // −2xP
  const laurent = new Map();
  let obstruction = null;
  if (pole && pole.c !== 0 && pole.k >= 1) {
    const { c, a, k } = pole;
    const add = (pw, v) => laurent.set(pw, (laurent.get(pw) ?? 0) + v);
    add(-k - 1, -k * c);                                         // d/dx c(x − a)^{−k}
    add(-k, -2 * a * c);                                         // −2a · c(x − a)^{−k}
    if (k === 1) poly[0] += -2 * c; else add(1 - k, -2 * c);     // −2(x − a) · c(x − a)^{−k}
    for (const [pw, v] of [...laurent]) if (v === 0) laurent.delete(pw);
    obstruction = { kind: 'pole', order: k + 1, coeff: -k * c, at: a };
  }
  const D = lastNonZero(poly);
  if (!obstruction && d >= 0) obstruction = { kind: 'degree', degree: d + 1, coeff: -2 * p[d] };
  const equalsOne = laurent.size === 0 && D <= 0 && (poly[0] ?? 0) === 1;
  return { poly, laurent, obstruction, equalsOne };
}

const lastNonZero = (c) => { let i = c.length - 1; while (i >= 0 && c[i] === 0) i--; return i; };

/** A number as a TeX coefficient: integers plainly, others with up to 6 significant digits. */
const num = (v) => (Number.isInteger(v) ? String(v) : String(+v.toPrecision(6)));

/** Σ c_j x^j as TeX, highest power first ('0' if all zero). */
export function polyTex(c, variable = 'x') {
  const parts = [];
  for (let j = c.length - 1; j >= 0; j--) {
    const v = c[j];
    if (!v) continue;
    const mag = Math.abs(v), coef = mag === 1 && j > 0 ? '' : num(mag);
    const pw = j === 0 ? '' : j === 1 ? variable : `${variable}^{${j}}`;
    parts.push({ sign: v < 0 ? '-' : '+', body: coef + pw });
  }
  if (!parts.length) return '0';
  return parts.map((t, i) => (i === 0 ? (t.sign === '-' ? '-' : '') : ` ${t.sign} `) + t.body).join('');
}

/** The Laurent part Σ c_m (x − a)^m (m < 0) as signed TeX terms, most singular first. */
function laurentTerms(laurent, a) {
  const base = a === 0 ? 'x' : `(x ${a < 0 ? '+' : '-'} ${num(Math.abs(a))})`;
  return [...laurent.entries()].sort((u, v) => u[0] - v[0])
    .map(([m, v]) => ({ sign: v < 0 ? '-' : '+', body: `\\frac{${num(Math.abs(v))}}{${base}${m === -1 ? '' : `^{${-m}}`}}` }));
}

/** The whole of R′ − 2xR as TeX: polynomial part, then the pole terms. */
export function residualTex({ poly, laurent }, a = 0) {
  const terms = [];
  for (let j = poly.length - 1; j >= 0; j--) {
    if (!poly[j]) continue;
    const mag = Math.abs(poly[j]), coef = mag === 1 && j > 0 ? '' : num(mag);
    terms.push({ sign: poly[j] < 0 ? '-' : '+', body: coef + (j === 0 ? '' : j === 1 ? 'x' : `x^{${j}}`) });
  }
  terms.push(...laurentTerms(laurent, a));
  if (!terms.length) return '0';
  return terms.map((t, i) => (i === 0 ? (t.sign === '-' ? '-' : '') : ` ${t.sign} `) + t.body).join('');
}
