function getButtons(group) {
  return [...group.querySelectorAll('.md3-button-group__button')];
}

function paintButton(group, button) {
  getButtons(group).forEach((item) => {
    const isSelected = item === button;

    item.classList.toggle('is-selected', isSelected);
    item.setAttribute('aria-checked', String(isSelected));
    item.tabIndex = isSelected ? 0 : -1;
  });
}

function selectButton(group, button, moveFocus = false) {
  if (button.getAttribute('aria-checked') === 'true') {
    if (moveFocus) button.focus();
    return;
  }

  paintButton(group, button);

  if (moveFocus) button.focus();

  group.dispatchEvent(
    new CustomEvent('buttongroupchange', {
      bubbles: true,
      detail: { value: button.dataset.value },
    })
  );
}

function mountGroup(group, initialValue) {
  const buttons = getButtons(group);
  const initialValueResolved =
    group.dataset.initialValue || initialValue || 'pyq';
  const initialButton =
    buttons.find((button) => button.dataset.value === initialValueResolved) ||
    buttons[0];

  if (initialButton) paintButton(group, initialButton);

  group.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;

    const button = event.target.closest?.('.md3-button-group__button');

    if (!button) return;

    selectButton(group, button);
  });

  group.addEventListener('click', (event) => {
    const button = event.target.closest?.('.md3-button-group__button');

    if (!button) return;

    selectButton(group, button);
  });

  group.addEventListener('keydown', (event) => {
    const button = event.target.closest?.('.md3-button-group__button');

    if (!button) return;

    const index = buttons.indexOf(button);
    let nextIndex = index;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % buttons.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + buttons.length) % buttons.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = buttons.length - 1;
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      selectButton(group, button);
      return;
    } else {
      return;
    }

    event.preventDefault();
    selectButton(group, buttons[nextIndex], true);
  });
}

export function mountButtonGroup(initialValue = 'pyq') {
  document.querySelectorAll('.md3-button-group').forEach((group) => {
    mountGroup(group, initialValue);
  });
}
