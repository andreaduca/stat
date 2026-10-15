/* data.js — the homework's static data files (hw02/data/*.json), fetched
   relative to this module so pages and workers find them alike. Read-only. */

/** @param {string} name e.g. 'timeline' for data/timeline.json */
export async function loadData(name) {
  const response = await fetch(new URL(`../../data/${name}.json`, import.meta.url));
  if (!response.ok) throw new Error(`data/${name}.json could not be loaded`);
  return response.json();
}
