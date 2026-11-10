export function mountDisclosures(root) {
  const triggers = root.querySelectorAll('[data-disclosure-trigger]');

  triggers.forEach((trigger) => {
    const panel = document.getElementById(trigger.getAttribute('aria-controls') || '');
    if (!panel) return;

    trigger.addEventListener('click', () => {
      const expanded = trigger.getAttribute('aria-expanded') === 'true';
      const icon = trigger.querySelector('.material-symbols-rounded');

      trigger.setAttribute('aria-expanded', String(!expanded));
      panel.hidden = expanded;
      if (icon) icon.textContent = expanded ? 'add' : 'remove';
    });
  });
}
