import { setTheme } from '../core/theme.js';

function syncThemeToggle() {
  const button = document.querySelector('.md3-theme-toggle');
  const icon = button?.querySelector('.material-symbols-rounded');

  if (!button || !icon) return;

  const isDark = document.documentElement.dataset.theme === 'dark';
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  icon.textContent = isDark ? 'light_mode' : 'dark_mode';
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
}

export function mountThemeToggle() {
  const button = document.querySelector('.md3-theme-toggle');

  if (!button) return;

  syncThemeToggle();

  button.addEventListener('click', () => {
    const isDark = document.documentElement.dataset.theme === 'dark';
    setTheme(isDark ? 'light' : 'dark');
  });

  window.addEventListener('themechange', syncThemeToggle);
}
