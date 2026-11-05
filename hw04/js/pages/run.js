/* run.js — hw04's simulations, run in its worker through the shared runner
   (assets/js/ui/run.js): a per-page cache, a progress bar on the first run of
   each panel, and the previous result kept on screen while a new one computes. */

import { runner } from '../../../assets/js/ui/run.js';

export const { getRun, forget, pending, updatingFlag } = runner(new URL('../workers/sim.js', import.meta.url));
