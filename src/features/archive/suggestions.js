import { onModeChange } from './mode.js';

const RESULT_LIMIT = 8;

function flattenCatalog(catalog) {
  return catalog.flatMap((semester) =>
    semester.subjects.map((subject) => ({
      code: subject.value,
      name: subject.label,
      semester: semester.value,
      semesterLabel: semester.label,
    })),
  );
}

function rank(subject, needle) {
  const code = subject.code.toLowerCase();
  const name = subject.name.toLowerCase();

  if (code.startsWith(needle)) return 0;
  if (code.includes(needle)) return 1;
  if (name.startsWith(needle)) return 2;
  return 3;
}

function matches(subjects, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  return subjects
    .filter(
      (subject) =>
        subject.code.toLowerCase().includes(needle) || subject.name.toLowerCase().includes(needle),
    )
    .map((subject) => ({ subject, score: rank(subject, needle) }))
    .sort((a, b) => a.score - b.score || a.subject.name.localeCompare(b.subject.name))
    .slice(0, RESULT_LIMIT)
    .map(({ subject }) => subject);
}

export function mountSearchSuggestions(filtersReady, root = document) {
  const input = root.querySelector('[data-search-input]');
  const list = root.querySelector('[data-search-suggestions]');
  const icon = root.querySelector('[data-search-icon]');
  const wrapper = input?.closest('.md3-search');
  if (!input || !list || !wrapper) return null;

  let filters = null;
  let subjects = [];
  let results = [];
  let active = -1;
  const text = { pyq: '', notes: '' };

  function hide() {
    list.hidden = true;
    list.replaceChildren();
    results = [];
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function paintIcon() {
    if (!icon) return;

    const hasValue = input.value.length > 0;
    icon.textContent = hasValue ? 'close' : 'search';

    if (hasValue) {
      icon.setAttribute('role', 'button');
      icon.setAttribute('tabindex', '0');
      icon.setAttribute('aria-label', 'Clear search');
      icon.removeAttribute('aria-hidden');
    } else {
      icon.removeAttribute('role');
      icon.removeAttribute('tabindex');
      icon.removeAttribute('aria-label');
      icon.setAttribute('aria-hidden', 'true');
    }
  }

  function clearSearch() {
    input.value = '';
    paintIcon();
    hide();
    input.focus();
  }

  function setActive(index) {
    active = index;

    Array.from(list.children).forEach((item, itemIndex) => {
      const selected = itemIndex === index;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-selected', String(selected));
    });

    if (index >= 0 && list.children[index]) {
      input.setAttribute('aria-activedescendant', `search-suggestion-${index}`);
      list.children[index].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function choose(index) {
    const subject = results[index];
    if (!subject || !filters) return;

    filters.selectSubject(subject.semester, subject.code);

    input.value = subject.name;
    paintIcon();
    hide();
    input.blur();
  }

  function render() {
    list.replaceChildren();
    active = -1;

    if (!results.length) {
      hide();
      return;
    }

    results.forEach((subject, index) => {
      const item = document.createElement('li');
      item.className = 'md3-suggestion';
      item.id = `search-suggestion-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');

      const meta = document.createElement('span');
      meta.className = 'md3-suggestion__meta';

      const code = document.createElement('span');
      code.className = 'md3-suggestion__code';
      code.textContent = subject.code;

      const name = document.createElement('span');
      name.className = 'md3-suggestion__name';
      name.textContent = subject.name;

      meta.append(code, name);

      const semester = document.createElement('span');
      semester.className = 'md3-suggestion__semester';
      semester.textContent = subject.semesterLabel;

      item.append(meta, semester);

      item.addEventListener('click', () => {
        choose(index);
      });

      list.append(item);
    });

    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function update(query) {
    if (!filters) {
      hide();
      return;
    }

    results = matches(subjects, query);
    render();
  }

  input.addEventListener('input', () => {
    paintIcon();
    update(input.value);
  });

  icon?.addEventListener('click', () => {
    if (input.value.length === 0) return;
    clearSearch();
  });

  icon?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (input.value.length === 0) return;
    event.preventDefault();
    clearSearch();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      if (list.hidden) {
        if (input.value.trim()) update(input.value);
        return;
      }

      if (!results.length) return;
      event.preventDefault();
      setActive((active + 1) % results.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      if (!results.length) return;
      event.preventDefault();
      setActive((active - 1 + results.length) % results.length);
      return;
    }

    if (event.key === 'Enter') {
      if (list.hidden || !results.length) return;
      event.preventDefault();
      choose(active >= 0 ? active : 0);
      return;
    }

    if (event.key === 'Escape') {
      hide();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (list.hidden) return;
    if (wrapper.contains(event.target) || list.contains(event.target)) return;
    hide();
  });

  filtersReady.then((value) => {
    filters = value;
    if (!filters) return;

    subjects = flattenCatalog(filters.getCatalog());
    if (input.value.trim()) update(input.value);
  });

  onModeChange((next, previous) => {
    text[previous] = input.value;
    input.value = text[next];
    paintIcon();
    hide();
    queueMicrotask(syncSubjects);
  });

  document.addEventListener('catalogchange', syncSubjects);

  function syncSubjects() {
    if (!filters) return;
    subjects = flattenCatalog(filters.getCatalog());
    if (input.value.trim()) update(input.value);
  }

  paintIcon();
}
