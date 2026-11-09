export function mountSelect(root, { onChange } = {}) {
  const button = root.querySelector('[data-select-button]');
  const label = root.querySelector('[data-select-label]');
  const menu = root.querySelector('menu');
  const placeholder = label.textContent.trim();

  let options = [];
  let value = '';
  let disabled = false;

  const selected = () => options.find((option) => option.value === value) || null;

  function render() {
    menu.replaceChildren();

    options.forEach((option) => {
      const item = document.createElement('li');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.value === value));
      item.dataset.value = option.value;

      if (option.description) {
        item.classList.add('has-description');
        item.setAttribute('aria-label', `${option.label}, ${option.description}`);

        const name = document.createElement('span');
        name.className = 'md3-select__option-label';
        name.textContent = option.label;

        const description = document.createElement('span');
        description.className = 'md3-select__option-description';
        description.textContent = option.description;

        item.append(name, description);
      } else {
        item.textContent = option.label;
      }

      menu.append(item);
    });
  }

  function paint() {
    const option = selected();
    label.textContent = option ? option.label : placeholder;
    button.classList.toggle('has-value', Boolean(option));
  }

  function close() {
    menu.classList.remove('active');
    button.setAttribute('aria-expanded', 'false');
  }

  function open() {
    if (disabled || options.length === 0) return;
    menu.classList.add('active');
    button.setAttribute('aria-expanded', 'true');
  }

  function choose(next, { notify = true } = {}) {
    value = next;
    paint();
    render();

    if (notify && onChange) onChange(value);
  }

  button.addEventListener('click', () => {
    if (menu.classList.contains('active')) close();
    else open();
  });

  menu.addEventListener('click', (event) => {
    if (!menu.classList.contains('active')) return;

    const item = event.target.closest('li');
    if (!item) return;

    choose(item.dataset.value);
    close();
  });

  document.addEventListener('click', (event) => {
    if (!root.contains(event.target)) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !menu.classList.contains('active')) return;

    close();
    button.focus();
  });

  paint();
  render();

  return {
    setOptions(next) {
      options = next;
      value = '';
      paint();
      render();
      close();
    },
    setValue(next, settings) {
      if (!options.some((option) => option.value === next)) return;
      choose(next, settings);
    },
    getValue() {
      return value;
    },
    setDisabled(next) {
      disabled = next;
      button.disabled = next;
      if (next) close();
    },
  };
}
