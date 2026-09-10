// Storage can be unavailable in private or restricted browser contexts.
export const saved = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* The download still works. */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Nothing to clear. */
    }
  },
};
