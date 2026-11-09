const STORAGE_KEY = 'ktu-papers-prefetch';
const MAX_AGE = 15000;

export function writePapersPrefetch(semester, code, value) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ semester, code, value, time: Date.now() }),
    );
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function readPapersPrefetch(semester, code) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    sessionStorage.removeItem(STORAGE_KEY);

    const entry = JSON.parse(raw);
    if (
      entry?.semester !== semester ||
      entry?.code !== code ||
      Date.now() - entry.time > MAX_AGE
    ) {
      return null;
    }

    return entry.value;
  } catch {
    return null;
  }
}
