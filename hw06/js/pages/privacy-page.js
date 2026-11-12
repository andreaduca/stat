/* privacy-page.js — statistical distance and differential privacy (note 06 §3): the
   distance between two Gaussians is an L¹ integral (Ex. 1) with a Φ closed form (Ex. 2),
   met by a simulated distinguisher; the analytic Gaussian mechanism is a difference of
   two Φ tails, which a naive Φ gets wrong. [[Statistical distance]],
   [[Gaussian mechanism in differential privacy]]. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot, curve } from '../../../assets/js/ui/plot.js';
import { nice, sig } from '../../../assets/js/ui/format.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { show, onCommit, numberOr } from '../../../assets/js/ui/dock.js';
import { pdf } from '../core/normal.js';
import { sdGaussNumeric, sdGaussClosed, deltaOf, analyticSigma, classicalSigma, PhiNaive } from '../core/privacy.js';
import { readInputs, dock, rejected } from './inputs.js';
import { RIEMANN, LEBESGUE, REF, MUTED, legend, figure, evidenceHtml, getRun, pending, updatingFlag, abstract, anchor } from './widgets.js';
import { hw06Shell, STICKY, MEMORY } from './shell.js';

const e2s = (x, d = 2) => (x === 0 ? '0' : !Number.isFinite(x) ? String(x) : x.toExponential(d));
const MUS = [0.1, 0.25, 0.5, 1, 1.5, 2, 3];
/** A small number as TeX: 10^{-5}, or 2.5 \cdot 10^{-8}. */
const texSci = (x) => { const e = Math.floor(Math.log10(x)), a = x / 10 ** e; return Math.abs(a - 1) < 1e-9 ? `10^{${e}}` : `${+a.toPrecision(3)} \cdot 10^{${e}}`; };
const TRIALS = 100000;

/* ---------- this page's row in the dock ---------- */

function readPage(state) {
  const mu = numberOr(state.mu, 1), eps = numberOr(state.eps, 0.5), dstar = numberOr(state.dstar, 1e-5), sens = numberOr(state.sens, 1);
  let error = null;
  if (!(mu > 0 && mu <= 10)) error = `μ must be in (0, 10] (got ${mu}).`;
  else if (!(eps > 0 && eps <= 10)) error = `ε must be in (0, 10] (got ${eps}).`;
  else if (!(dstar > 0 && dstar < 0.5)) error = `δ must be in (0, 0.5) (got ${dstar}).`;
  else if (!(sens > 0 && sens <= 1000)) error = `the sensitivity Δ must be in (0, 1000] (got ${sens}).`;
  return { mu, eps, dstar, sens, error };
}

const OWN = {
  id: 'privacy', label: 'this page',
  build(apply, later) {
    const num = (label, key) => { const i = el('input', { type: 'number', class: 'num', step: 'any', 'aria-label': label }); onCommit(i, () => apply({ [key]: i.value }), later); return i; };
    const mu = num('shift mu between the two Gaussians', 'mu'), eps = num('privacy parameter epsilon', 'eps'), dstar = num('privacy parameter delta', 'dstar'), sens = num('sensitivity of the query', 'sens');
    return {
      nodes: [el('div', { class: 'row' }, [field('E14a: shift μ', mu), el('span', { class: 'vrule' }), field('E14b: ε', eps), field('δ', dstar), field('sensitivity Δ', sens)])],
      refresh(v) { show(mu, v.mu); show(eps, v.eps); show(dstar, v.dstar); show(sens, v.sens); },
    };
  },
  summary: (v) => `μ = ${v.mu} · ε = ${v.eps}, δ = ${e2s(v.dstar, 0)}, Δ = ${v.sens}`,
  notes: [
    '<strong>μ</strong>: the distance between the means of N(0, 1) and N(μ, 1).',
    '<strong>ε, δ, Δ</strong>: the privacy target and the sensitivity of the released query (how much one person can change it); E14b finds the noise σ.',
  ],
};

/* ---------- theory ---------- */

function theory() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Distance is an integral, privacy a difference of tails' }),
    el('div', { class: 'cols' }, [
      el('div', {}, [
        el('div', { html: M`\Delta(P, Q) = \tfrac{1}{2}\int |p - q| = \operatorname{sup}_A |P(A) - Q(A)|` }),
        el('p', { class: 'small muted', html: `${evidenceHtml('T')} The statistical distance is the best advantage any test has at telling ${m`P`} from ${m`Q`} with one sample. For ${m`N(0,1)`} and ${m`N(\mu,1)`}, ${m`p > q`} exactly on ${m`x < \mu/2`}, so ${m`\Delta = 2\Phi(\mu/2) - 1`}.` }),
      ]),
      el('div', {}, [
        el('div', { html: M`\delta(\varepsilon, \sigma) = \Phi\!\left(\tfrac{\Delta}{2\sigma} - \tfrac{\varepsilon\sigma}{\Delta}\right) - e^{\varepsilon}\,\Phi\!\left(-\tfrac{\Delta}{2\sigma} - \tfrac{\varepsilon\sigma}{\Delta}\right)` }),
        el('p', { class: 'small muted', html: `${evidenceHtml('S')} The analytic Gaussian mechanism (Balle & Wang 2018): adding ${m`N(0, \sigma^2)`} noise to a query of sensitivity ${m`\Delta`} is ${m`(\varepsilon, \delta)`}-private for exactly this ${m`\delta`}: two lower-tail ${m`\Phi`} values that nearly cancel.` }),
      ]),
    ]),
  ]);
}

/* ---------- E14a · distance and distinguisher ---------- */

function distance(page, inputs, redraw) {
  const mu = page.mu, num = sdGaussNumeric(mu), closed = sdGaussClosed(mu);
  const lo = -4, hi = mu + 4, c = mu / 2;
  const dens = plot({
    x: { min: lo, max: hi, title: 'x' }, y: { min: 0, max: 0.43, title: 'density' }, width: 420, height: 260,
    layers: [
      { type: 'band', band: curve((x) => pdf(x), lo, c, 120).map(([x, y]) => [x, pdf(x - mu), y]), color: RIEMANN },
      { type: 'line', points: curve(pdf, lo, hi), color: RIEMANN, label: 'p = N(0, 1)', end: 'p' },
      { type: 'line', points: curve((x) => pdf(x - mu), lo, hi), color: LEBESGUE, label: `q = N(${mu}, 1)`, end: 'q' },
      { type: 'vline', at: c, color: MUTED, text: 'μ/2' },
    ],
    label: 'two normal densities, with the region where the first exceeds the second shaded: its area is the statistical distance',
  });
  const spec = { kind: 'distinguisher', args: { mus: MUS, n: TRIALS, seed: inputs.seed } };
  const got = getRun(spec, redraw, 'E14a');
  const known = [[0.01, 3.989406e-3], [0.1, 3.987761e-2], [1, 3.829249e-1], [3, 8.663856e-1]];
  return labPanel({
    hw: 'hw06', id: 'E14a', title: 'E14a · How distinguishable are two Gaussians?', name: `E14a-mu${mu}-seed${inputs.seed}`,
    question: `With one sample, how well can anyone tell ${m`N(0, 1)`} from ${m`N(${mu}, 1)`}?`,
    steps: [
      `integrate ${m`\tfrac{1}{2}|p - q|`} by Simpson on ${m`[-15, 15 + \mu]`}, 10⁵ cells, split at the kink ${m`\mu/2`}; and evaluate ${m`2\Phi(\mu/2) - 1`};`,
      `simulate the threshold test “say q if ${m`x > \mu/2`}” ${nice(TRIALS)} times per μ (seed ${inputs.seed}); its advantage, with a 99 % Wilson interval.`,
    ],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const res = got.result;
      const adv = plot({
        x: { min: 0, max: 3.2, title: 'μ' }, y: { min: 0, max: 1, title: 'advantage' }, width: 420, height: 260,
        layers: [
          { type: 'line', points: curve(sdGaussClosed, 0, 3.2), color: REF, label: 'Δ = 2Φ(μ/2) − 1' },
          { type: 'points', points: res.map((r) => [r.mu, r.advantage]), err: res.map((r) => [r.mu, r.lo, r.hi]), color: LEBESGUE, r: 3.5, label: 'simulated' },
        ],
        label: 'simulated distinguisher advantage with 99 percent intervals against the statistical distance',
      });
      const nIn = res.filter((r) => r.sd >= r.lo && r.sd <= r.hi).length, inside = nIn === res.length;
      return {
        answer: { text: `For μ = ${mu}: <strong>Δ = ${sig(closed, 7)}</strong> by the closed form, ${sig(num, 7)} by integration (${e2s(Math.abs(num - closed) / closed, 1)} apart). The simulated test reaches Δ: ${nIn} of ${res.length} values of Δ lie inside the 99 % intervals${inside ? '' : ' (with this many intervals one miss happens about 7 % of the time by chance; try another seed)'}. The threshold test is the best there is.`, ok: nIn >= res.length - 1 },
        body: [
          el('div', { class: 'cols' }, [
            el('div', {}, [...section(1, 'The two densities', 'Shaded: where p exceeds q; its area is Δ.'), dens]),
            el('div', {}, [...section(2, 'The best test, simulated', 'Dots with 99 % intervals; line: Δ.'), adv]),
          ]),
          table(['μ', 'Δ by integration', 'Δ by 2Φ(μ/2) − 1', 'published'], known.map(([mm, v]) => [String(mm), sig(sdGaussNumeric(mm), 7), sig(sdGaussClosed(mm), 7), String(v)])),
        ],
        rows: res,
        summary: { mu, numeric: num, closed, seed: inputs.seed, distinguisher: res },
      };
    },
    why: 'every security definition that says “indistinguishable” is a bound on a statistical distance; computing it is an integral, and for Gaussians a value of Φ.',
    notes: [`For small μ, ${m`2\Phi(\mu/2) - 1`} is a difference of two numbers near ½; the page computes it from the positive series as ${m`2(\Phi(\mu/2) - \tfrac{1}{2})`}, so μ = 0.01 keeps all its digits.`],
  });
}

/* ---------- E14b · calibrating the Gaussian mechanism ---------- */

function calibrator(page) {
  const { eps, dstar, sens } = page;
  const sA = analyticSigma(eps, dstar, sens), sC = classicalSigma(eps, dstar, sens);
  const sMax = Math.max(1.3 * sC, analyticSigma(eps, 1e-16, sens));
  const sigmas = Array.from({ length: 200 }, (_, i) => 0.3 * sens + (i / 199) * (sMax - 0.3 * sens));
  const exact = sigmas.map((s) => [s, deltaOf(eps, s, sens)]);
  const chart = plot({
    x: { min: sigmas[0], max: sMax, title: 'noise σ' }, y: { log: true, min: 1e-17, max: 1, title: 'δ(ε, σ)' }, width: 420, height: 270,
    layers: [
      { type: 'hline', at: dstar, color: MUTED },
      { type: 'line', points: exact.filter(([, d]) => d > 0), color: REF, label: 'δ with M7' },
      { type: 'vline', at: sA, color: RIEMANN, text: 'analytic' },
      { type: 'vline', at: sC, color: MUTED, text: 'classical' },
    ],
    label: 'delta as a function of the noise, with the target delta and the two calibrated sigmas',
  });
  const damage = plot({
    x: { min: sigmas[0], max: sMax, title: 'noise σ' }, y: { log: true, min: 1e-17, max: 1, title: 'relative error of δ' }, width: 420, height: 270,
    layers: [{ type: 'line', points: sigmas.map((s) => { const g = deltaOf(eps, s, sens), b = deltaOf(eps, s, sens, PhiNaive); return [s, g > 0 ? Math.max(1e-17, Math.abs(b - g) / g) : NaN]; }), color: LEBESGUE, label: 'naive Φ' }],
    label: 'relative error of delta when Phi is computed as one minus Phi of minus x, growing with the noise',
  });
  const cases = [[1, 1e-5], [1, 1e-10], [1, 1e-14], [0.5, 1e-5], [0.5, 1e-10]].map(([e, d]) => {
    const s = analyticSigma(e, d, 1), good = deltaOf(e, s, 1), bad = deltaOf(e, s, 1, PhiNaive);
    return [String(e), e2s(d, 0), sig(s, 6), sig(classicalSigma(e, d, 1), 6), e2s(Math.abs(bad - good) / good, 1)];
  });
  return labPanel({
    hw: 'hw06', id: 'E14b', title: 'E14b · How much noise buys (ε, δ)-privacy?', name: `E14b-e${eps}-d${dstar}`,
    question: `How much Gaussian noise σ makes a query of sensitivity ${m`\Delta = ${sens}`} differentially private with ${m`(\varepsilon, \delta) = (${eps}, ${texSci(dstar)})`}, and what happens with a careless Φ?`,
    steps: [
      `solve ${m`\delta(\varepsilon, \sigma) = \delta^*`} for σ by bisection on [0.05, 500] (δ decreases in σ);`,
      `compare with the classical ${m`\sigma = \Delta\sqrt{2\ln(1.25/\delta)}/\varepsilon`} (valid for ε < 1);`,
      `recompute δ with ${m`\Phi(x) = 1 - \Phi(-x)`} for ${m`x < 0`}, and measure the damage.`,
    ],
    view: () => ({
      answer: { text: `The exact calibration needs <strong>σ = ${sig(sA, 5)}</strong>; the classical formula asks for ${sig(sC, 5)}${eps >= 1 ? ' (and is not even valid for ε ≥ 1)' : ''}: ${((sC / sA - 1) * 100).toFixed(0)} % more noise than necessary. With a naive Φ the computed δ is wrong by up to ${cases[2][4]} at δ = 10⁻¹⁴: the guarantee is misreported.`, ok: false },
      body: [
        el('div', { class: 'cols' }, [
          el('div', {}, [...section(1, 'δ against the noise', `The calibrated σ is where the curve crosses the target ${m`\delta^* = ${texSci(dstar)}`} (dashed).`), chart]),
          el('div', {}, [...section(2, 'The cost of a naive Φ', 'Relative error of δ computed with 1 − Φ(−x): it grows as δ shrinks, because the two tails it subtracts lose their digits.'), damage]),
        ]),
        ...section(3, 'Calibrations', 'Δ = 1. Last column: relative error of δ when computed with the naive Φ, at the analytic σ.'),
        table(['ε', 'δ', 'analytic σ', 'classical σ', 'δ error, naive Φ'], cases),
      ],
      rows: cases.map(([e, d, a, c, err]) => ({ eps: e, delta: d, analytic: a, classical: c, naiveError: err })),
      summary: { eps, dstar, sens, analytic: sA, classical: sC },
    }),
    why: 'a privacy guarantee is a number someone relies on. δ is a difference of two tiny tails; if Φ is only accurate in absolute terms, the reported δ is not the true one.',
    notes: [`Simulation of the arithmetic only: real deployments also need privacy accounting over many releases, and noise generators that are themselves safe (floating-point attacks on the Laplace mechanism, Mironov 2012 ${evidenceHtml('S')}).`],
  });
}

startPage({
  shell: hw06Shell('privacy.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const inputs = readInputs(api.state), page = readPage(api.state);
    const error = inputs.error ?? page.error;
    dock({ ...inputs, error }, api.update, OWN, page);
    if (error) return [rejected(error)];
    const redraw = () => api.draw();
    return [
      abstract({
        question: 'How far apart are two distributions, as seen by an attacker? And how much noise makes a released statistic differentially private — computed with which Φ?',
        findings: [
          '<strong>Distance is an integral.</strong> The statistical distance of N(0, 1) and N(μ, 1) computed by Simpson and by 2Φ(μ/2) − 1 agree to about 10⁻¹⁴; a simulated threshold test reaches it at every μ (E14a).',
          '<strong>Exact calibration saves noise.</strong> At ε = 0.5, δ = 10⁻⁵ the analytic Gaussian mechanism needs σ = 7.03, the classical formula 9.69: 38 % more noise than necessary (E14b).',
          '<strong>A careless Φ misreports privacy.</strong> With 1 − Φ(−x) in place of a tail-accurate Φ, δ is off by 6·10⁻³ relative at ε = 1, δ = 10⁻¹⁴ (E14b).',
        ],
        sections: [['theory', 'Distance and privacy'], ['E14a', 'E14a · two Gaussians'], ['E14b', 'E14b · the Gaussian mechanism']],
      }),
      anchor('theory', theory()), anchor('E14a', distance(page, inputs, redraw)), anchor('E14b', calibrator(page)),
    ];
  },
});
