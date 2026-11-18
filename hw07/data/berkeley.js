/* berkeley.js — graduate admissions at UC Berkeley, autumn 1973, the six largest
   departments: the counts behind the most famous case of Simpson's paradox.
   An ES module (imported like code: no fetch at runtime, loads under Node too).
   Note 02 D2; [[Simpson's paradox]]. */

export const SOURCE = {
  citation: 'P. J. Bickel, E. A. Hammel, J. W. O’Connell, “Sex bias in graduate admissions: data from Berkeley”, Science 187 (4175), 398–404 (1975)',
  doi: '10.1126/science.187.4175.398',
  dataset: 'R datasets::UCBAdmissions (the same six departments)',
  scope: 'The six largest departments only (4 526 applications), not the whole university (12 763). The departments are anonymised as A–F in the source.',
};

export const GENDERS = ['men', 'women'];
export const OUTCOMES = ['admitted', 'rejected'];

/* [men admitted, men rejected, women admitted, women rejected] per department */
export const DEPARTMENTS = [
  { dept: 'A', counts: [512, 313, 89, 19] },
  { dept: 'B', counts: [353, 207, 17, 8] },
  { dept: 'C', counts: [120, 205, 202, 391] },
  { dept: 'D', counts: [138, 279, 131, 244] },
  { dept: 'E', counts: [53, 138, 94, 299] },
  { dept: 'F', counts: [22, 351, 24, 317] },
];
