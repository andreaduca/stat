/* store.js — localStorage with the sharp edges removed. Browsers throw on it in
   private windows and when site data is blocked, so every access is guarded and
   a failure simply means "nothing saved". Values are JSON. */

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** @returns {boolean} false when the browser refused to store anything */
export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
