(() => {
  const root = document.documentElement;
  let preference = 'system';

  try {
    const stored = localStorage.getItem('ktu-theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      preference = stored;
    }
  } catch {
    preference = 'system';
  }

  const dark =
    preference === 'dark' ||
    (preference === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.themePreference = preference;
})();
