import { buildCatalog, buildNotesCatalog } from './catalog.js';
import { getMode, onModeChange } from './mode.js';
import { fetchCatalog, fetchNotes, fetchNotesSubjects, fetchPapers } from '../../services/archive.js';
import { writePapersPrefetch } from '../papers/cache.js';
import { mountSelect } from '../../components/select.js';
import { showToast } from '../../components/toast.js';

export async function mountFilters(root = document) {
  const semesterRoot = root.querySelector('[data-filter="semester"]');
  const branchRoot = root.querySelector('[data-filter="branch"]');
  const subjectRoot = root.querySelector('[data-filter="subject"]');
  if (!semesterRoot || !branchRoot || !subjectRoot) return null;

  const searchButton = root.querySelector('[data-search-button]');
  const searchLoader = searchButton?.querySelector('[data-search-button-loader]') ?? null;
  const searchLabel = searchButton?.querySelector('[data-search-button-label]') ?? null;
  const searchInput = root.querySelector('[data-search-input]');
  const searchFieldLabel = root.querySelector('.md3-field label');
  const branchWrapper = branchRoot.closest('.md3-select');

  const catalogs = { pyq: [], notes: [] };
  const saved = { pyq: null, notes: null };

  let activeCatalog = [];
  let semesterEntry = null;
  let searching = false;
  let notesState = 'idle';

  const semesterSelect = mountSelect(semesterRoot, {
    onChange: onSemesterChange,
  });
  const branchSelect = mountSelect(branchRoot, {
    onChange: onBranchChange,
  });
  const subjectSelect = mountSelect(subjectRoot, {
    onChange: onSubjectChange,
  });

  semesterSelect.setDisabled(true);
  branchSelect.setDisabled(true);
  subjectSelect.setDisabled(true);

  try {
    catalogs.pyq = buildCatalog(await fetchCatalog());
  } catch {
    return null;
  }

  activeCatalog = catalogs[getMode()] || [];
  syncModeUi();
  resetSelection();
  applySelection(saved[getMode()]);
  emit();

  if (getMode() === 'notes') loadNotes();

  function syncModeUi() {
    const notes = getMode() === 'notes';

    if (branchWrapper) branchWrapper.hidden = notes;
    if (searchFieldLabel) searchFieldLabel.textContent = notes ? 'Search Notes' : 'Search Papers';
    if (searchInput) {
      searchInput.setAttribute('aria-label', notes ? 'Search Notes' : 'Search Papers');
    }
  }

  function reset(select) {
    select.setOptions([]);
    select.setDisabled(true);
  }

  function subjectOptions(subjects) {
    return subjects.map(({ value, label }) => ({ value, label, description: value }));
  }

  function resetSelection() {
    const options = activeCatalog.map(({ value, label }) => ({ value, label }));

    semesterEntry = null;
    semesterSelect.setOptions(options);
    semesterSelect.setDisabled(options.length === 0);
    reset(branchSelect);
    reset(subjectSelect);
  }

  function applySelection(state) {
    if (!state?.semester) return;

    if (state.subject && !state.branch) {
      selectSubject(state.semester, state.subject);
      return;
    }

    semesterSelect.setValue(state.semester, { notify: true });
    if (state.branch) branchSelect.setValue(state.branch, { notify: true });
    if (state.subject) subjectSelect.setValue(state.subject, { notify: true });
  }

  function selectSubject(semester, subject) {
    semesterSelect.setValue(semester, { notify: true });
    subjectSelect.setValue(subject, { notify: false });
    emit();
  }

  function activateCatalog() {
    activeCatalog = catalogs[getMode()] || [];
    syncModeUi();
    resetSelection();
    applySelection(saved[getMode()]);
    emit();
  }

  function loadNotes() {
    if (notesState !== 'idle') return;
    notesState = 'loading';

    fetchNotesSubjects()
      .then((rows) => {
        catalogs.notes = buildNotesCatalog(rows);
        notesState = 'ready';

        if (getMode() === 'notes') activateCatalog();

        document.dispatchEvent(new CustomEvent('catalogchange', { detail: { mode: 'notes' } }));
      })
      .catch(() => {
        notesState = 'failed';
      });
  }

  function onSemesterChange(value) {
    semesterEntry = activeCatalog.find((entry) => entry.value === value) || null;

    reset(branchSelect);
    reset(subjectSelect);

    if (semesterEntry) {
      branchSelect.setOptions(semesterEntry.branches);
      branchSelect.setDisabled(semesterEntry.branches.length === 0);

      if (semesterEntry.branches.length === 1) {
        branchSelect.setValue(semesterEntry.branches[0].value);
      }

      subjectSelect.setOptions(subjectOptions(semesterEntry.subjects));
      subjectSelect.setDisabled(semesterEntry.subjects.length === 0);
    }

    emit();
  }

  function onBranchChange(value) {
    const branch = semesterEntry?.branches.find((entry) => entry.value === value) || null;
    const previous = subjectSelect.getValue();
    const subjects = branch ? branch.subjects : semesterEntry?.subjects || [];

    subjectSelect.setOptions(subjectOptions(subjects));
    subjectSelect.setDisabled(subjects.length === 0);

    if (previous) subjectSelect.setValue(previous);

    emit();
  }

  function onSubjectChange() {
    emit();
  }

  function getValues() {
    return {
      semester: semesterSelect.getValue(),
      branch: branchSelect.getValue(),
      subject: subjectSelect.getValue(),
    };
  }

  function currentSubjectName(subject) {
    return semesterEntry?.subjects.find((entry) => entry.value === subject)?.label ?? subject;
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((resolve) => {
        setTimeout(resolve, ms, null);
      }),
    ]);
  }

  function warmDestination() {
    return document.fonts
      .load('400 24px "Material Symbols Rounded"', 'download description')
      .then(() => document.fonts.load('400 16px "Google Sans Flex"'))
      .then(() => document.fonts.ready)
      .catch(() => {});
  }

  function emit() {
    const detail = { ...getValues(), mode: getMode() };
    const complete = detail.semester && detail.subject;

    if (searchButton) {
      searchButton.disabled = searching;
      searchButton.setAttribute('aria-disabled', String(!searching && !complete));
    }

    document.dispatchEvent(new CustomEvent('filterchange', { detail }));
  }

  onModeChange((next, previous) => {
    saved[previous] = getValues();
    activeCatalog = catalogs[next] || [];
    syncModeUi();
    resetSelection();
    applySelection(saved[next]);
    emit();

    if (next === 'notes') loadNotes();
  });

  searchButton?.addEventListener('click', async () => {
    const detail = getValues();
    const notes = getMode() === 'notes';
    if (searching) return;

    if (!detail.semester) {
      showToast('Select a semester.', { variant: 'warning' });
      return;
    }

    if (!detail.subject) {
      showToast(notes ? 'Select a subject.' : 'Select a branch and subject.', {
        variant: 'warning',
      });
      return;
    }

    const fetcher = notes ? fetchNotes : fetchPapers;
    const subjectName = currentSubjectName(detail.subject);

    searching = true;
    document.dispatchEvent(
      new CustomEvent('searchsubmit', { detail: { ...detail, mode: getMode() } }),
    );

    searchButton.disabled = true;
    searchButton.classList.add('is-loading');
    searchButton.setAttribute('aria-busy', 'true');
    if (searchLoader) searchLoader.hidden = false;
    if (searchLabel) searchLabel.textContent = notes ? 'Fetching Notes' : 'Fetching Papers';

    const [items] = await Promise.all([
      withTimeout(fetcher(detail.subject, detail.semester).catch(() => null), 10000),
      withTimeout(warmDestination(), 10000),
    ]);

    if (Array.isArray(items)) {
      writePapersPrefetch(detail.semester, detail.subject, {
        subjectName,
        items,
        kind: notes ? 'notes' : 'pyq',
      });
    }

    document.dispatchEvent(
      new CustomEvent(notes ? 'notesopen' : 'papersopen', {
        detail: { semester: detail.semester, code: detail.subject, subjectName },
      }),
    );

    searching = false;
    searchButton.classList.remove('is-loading');
    searchButton.removeAttribute('aria-busy');
    if (searchLoader) searchLoader.hidden = true;
    if (searchLabel) searchLabel.textContent = 'Search';
    emit();
  });

  return {
    getCatalog: () => activeCatalog,
    semesterSelect,
    subjectSelect,
    selectSubject,
  };
}
