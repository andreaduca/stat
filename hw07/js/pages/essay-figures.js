/* essay-figures.js — the three figures of the essay, drawn from the same code as the
   pages (default seed 20261117): Berkeley's admission rates pooled and by department,
   the pair tables of the LCG's last 4 bits and of xoshiro, and the masked side-channel
   leak by Hamming-weight class. Each fills the <div data-fig="…"> that holds it. */

import { el } from '../../../assets/js/ui/dom.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { barChart } from '../../../assets/js/ui/barchart.js';
import { generatorTables, stream, ID } from '../core/experiments.js';
import { traces } from '../core/sidechannel.js';
import { DEPARTMENTS } from '../../data/berkeley.js';
import { residualGrid, legend, categoryColors } from './widgets.js';

const SEED = 20261117;

function berkeley() {
  const rate = (a, r) => a / (a + r);
  const sum = (k) => DEPARTMENTS.reduce((s, d) => s + d.counts[k], 0);
  const cats = ['all (pooled)', ...DEPARTMENTS.map((d) => `dept ${d.dept}`)];
  const men = [rate(sum(0), sum(1)), ...DEPARTMENTS.map((d) => rate(d.counts[0], d.counts[1]))];
  const women = [rate(sum(2), sum(3)), ...DEPARTMENTS.map((d) => rate(d.counts[2], d.counts[3]))];
  return el('div', {}, [
    barChart({ categories: cats, series: [{ label: 'men', color: 'var(--s1)', values: men }, { label: 'women', color: 'var(--s2)', values: women }], yTitle: 'share admitted', width: 640, height: 230 }),
    legend([['bar', 'var(--s1)', 'men'], ['bar', 'var(--s2)', 'women']]),
  ]);
}

function generators() {
  const t = Object.fromEntries(generatorTables({ seed: SEED, N: 10000, eps: 0.05 }).map((g) => [g.kind, g.table]));
  return el('div', {}, [
    el('div', { class: 'cols' }, [
      el('div', {}, [el('h4', { class: 'fig-title', text: 'LCG, last 4 bits' }), residualGrid({ table: t.lcgLow, label: 'pair table of the LCG last 4 bits: only 8 cells occur' })]),
      el('div', {}, [el('h4', { class: 'fig-title', text: 'xoshiro128**' }), residualGrid({ table: t.good, label: 'pair table of xoshiro: noise' })]),
    ]),
    legend([['bar', 'var(--m2)', 'more pairs than expected'], ['bar', 'var(--m1)', 'fewer pairs than expected']]),
  ]);
}

function sideChannel() {
  const { labels, leaks } = traces(stream(SEED, ID.sideDetection, 3), 20000, { masked: true, sigma: 1, key: 0xb });
  const lo = -4, hi = 11, bins = 46, w = (hi - lo) / bins;
  const counts = Array.from({ length: 5 }, () => new Float64Array(bins)), tot = new Float64Array(5);
  for (let i = 0; i < labels.length; i++) { const b = Math.floor((leaks[i] - lo) / w); if (b >= 0 && b < bins) counts[labels[i]][b]++; tot[labels[i]]++; }
  const colors = categoryColors(5);
  return el('div', {}, [
    plot({ x: { min: lo, max: hi, title: 'measured power' }, y: { min: 0, title: 'density' }, width: 560, height: 220,
      layers: counts.map((c, h) => ({ type: 'line', points: Array.from(c, (v, b) => [lo + (b + 0.5) * w, v / (tot[h] * w)]), color: colors[h] })),
      label: 'masked leakage by Hamming-weight class: same centre, different widths' }),
    legend([0, 1, 2, 3, 4].map((h) => ['line', colors[h], `HW(v) = ${h}`])),
  ]);
}

const FIGS = { berkeley, generators, sideChannel };
for (const node of document.querySelectorAll('[data-fig]')) node.replaceChildren(FIGS[node.dataset.fig]());
