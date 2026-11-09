export function mountDrawer() {
  const trigger = document.querySelector('[data-menu-toggle]');
  const layer = document.querySelector('[data-drawer]');
  if (!trigger || !layer) return;

  const scrim = layer.querySelector('[data-drawer-scrim]');
  const closeButton = layer.querySelector('[data-drawer-close]');
  const firstItem = layer.querySelector('.md3-drawer__item');
  let closeTimer = 0;

  function focusable() {
    return [...layer.querySelectorAll('a[href], button:not([disabled])')].filter(
      (element) => !element.hidden,
    );
  }

  function open() {
    clearTimeout(closeTimer);
    layer.hidden = false;
    layer.classList.remove('is-open');
    void layer.offsetWidth;
    layer.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('md3-drawer-open');
    firstItem?.focus();
  }

  function close({ restoreFocus = true } = {}) {
    if (layer.hidden) return;

    clearTimeout(closeTimer);
    layer.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('md3-drawer-open');

    closeTimer = window.setTimeout(() => {
      if (layer.classList.contains('is-open')) return;
      layer.hidden = true;
      if (restoreFocus) trigger.focus();
    }, 320);
  }

  trigger.addEventListener('click', () => {
    if (layer.classList.contains('is-open')) close();
    else open();
  });

  closeButton?.addEventListener('click', () => close());
  scrim?.addEventListener('click', () => close());

  layer.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    close({ restoreFocus: false });
  });

  layer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== 'Tab') return;

    const items = focusable();
    if (items.length === 0) {
      event.preventDefault();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
