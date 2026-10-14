/* saved-curves.js — curves the reader builds themselves, kept in the browser so
   they can be used on the other pages. A saved curve behaves exactly like a
   preset: it gets an id, appears in every curve selector, and travels in the URL.
   Stored as strings because JSON cannot carry BigInt. */

import { load, save } from '../../../assets/js/ui/store.js';
import { PRESETS } from '../core/curves.js';

const KEY = 'hw01.saved-curves';
/** Where the curve in view is remembered, and which parameters describe it.
 *  Passed to startPage by every page of this homework. */
export const CURVE_MEMORY = 'hw01.current-curve';
export const CURVE_KEYS = ['curve', 'p', 'a', 'b', 'gx', 'gy'];

/** Same parameters, same id — saving a curve twice updates it instead of cloning. */
const idFor = ({ p, a, b }) => `s${p}-${a}-${b}`;

function savedCurves() {
  return load(KEY, []).map((c) => ({
    id: c.id,
    label: c.label,
    saved: true,
    p: BigInt(c.p), a: BigInt(c.a), b: BigInt(c.b),
    base: c.base ? { x: BigInt(c.base.x), y: BigInt(c.base.y) } : null,
    note: 'A curve you built yourself, kept in this browser. Remove it from the curve explorer.',
  }));
}

/** @returns {{id: string, ok: boolean}} ok is false if the browser blocks storage */
export function saveCurve({ p, a, b, base }) {
  const id = idFor({ p, a, b });
  const entry = {
    id,
    label: `saved · y² = x³ ${a === 0n ? '' : `+ ${a === 1n ? '' : a}x `}+ ${b} mod ${p}`,
    p: String(p), a: String(a), b: String(b),
    base: base ? { x: String(base.x), y: String(base.y) } : null,
  };
  const kept = load(KEY, []).filter((c) => c.id !== id);
  return { id, ok: save(KEY, [...kept, entry]) };
}

export function forgetCurve(id) {
  save(KEY, load(KEY, []).filter((c) => c.id !== id));
}

/** Presets first, then anything the reader saved — the list every selector shows. */
export const curveOptions = () => [...PRESETS, ...savedCurves()];

/** The query-string change that selects a curve from a dropdown. For a saved
 *  curve it also writes p, a, b and the base point, so the resulting link still
 *  opens the right curve in a browser that has never stored it. */
export function selectionParams(id) {
  if (id === 'custom') return { curve: null };          // keep the p, a, b being edited
  const chosen = curveOptions().find((c) => c.id === id);
  if (!chosen?.saved) return { curve: id, p: null, a: null, b: null, gx: null, gy: null };
  return {
    curve: id,
    p: String(chosen.p), a: String(chosen.a), b: String(chosen.b),
    gx: chosen.base ? String(chosen.base.x) : null,
    gy: chosen.base ? String(chosen.base.y) : null,
  };
}
