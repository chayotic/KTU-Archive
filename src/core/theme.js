const STORAGE_KEY = 'ktu-theme';
const root = document.documentElement;
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writePreference(preference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    return;
  }
}

function normalizePreference(preference) {
  return preference === 'light' || preference === 'dark' || preference === 'system'
    ? preference
    : 'system';
}

function resolveTheme(preference) {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }

  return systemTheme.matches ? 'dark' : 'light';
}

function getThemePreference() {
  return normalizePreference(readPreference());
}

function applyTheme(preference = getThemePreference()) {
  const nextPreference = normalizePreference(preference);
  const resolvedTheme = resolveTheme(nextPreference);

  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = nextPreference;

  window.dispatchEvent(
    new CustomEvent('themechange', {
      detail: { theme: resolvedTheme, preference: nextPreference },
    })
  );
}

export function setTheme(preference) {
  const nextPreference = normalizePreference(preference);
  writePreference(nextPreference);
  applyTheme(nextPreference);
}

export function initTheme() {
  applyTheme();

  systemTheme.addEventListener('change', () => {
    if (getThemePreference() === 'system') {
      applyTheme('system');
    }
  });
}
