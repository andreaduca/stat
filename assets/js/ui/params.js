/* params.js — read and write the URL query string, so a panel's exact
   configuration (?curve=C1&k=6) can be linked, reloaded and shared. */

/** Current query string as a plain object. */
export function readParams() {
  return Object.fromEntries(new URLSearchParams(location.search));
}

/** Merge values into the query string without reloading the page.
 *  Null/undefined/'' removes a key. Uses replaceState: the back button
 *  stays useful instead of recording every slider nudge. */
export function writeParams(values) {
  const q = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === '') q.delete(key);
    else q.set(key, String(value));
  }
  const qs = q.toString();
  history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
}
