/* lab-panel.js — hw04's experiments use the shared frame of
   assets/js/ui/lab.js as it is; this only fills in the homework, so the Notes
   and the exported files are named hw04-…. The simulation itself comes from
   run.js (shared by every panel of a page), so the frame never starts work
   of its own. */

import { labPanel as frame } from '../../../assets/js/ui/lab.js';

export { section, table, verdict } from '../../../assets/js/ui/lab.js';

/** The shared frame for hw04: see assets/js/ui/lab.js for the options. */
export const labPanel = (o) => frame({ hw: 'hw04', ...o });
