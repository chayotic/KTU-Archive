import { updateAllFields } from 'beercss/dist/cdn/elements/field.js';
import { initTheme } from './core/theme.js';
import { mountThemeToggle } from './components/theme-toggle.js';
import { mountButtonGroup } from './components/button-group.js';
import { mountDrawer } from './components/drawer.js';
import { mountToast } from './components/toast.js';
import { mountFilters } from './features/archive/filters.js';
import { mountSearchSuggestions } from './features/archive/suggestions.js';
import { mountStatus } from './features/archive/status.js';
import { mountNotifications } from './features/notifications/notifications.js';
import { initSplash } from './core/splash.js';
import { mountPapers } from './features/papers/papers.js';
import { readSelection, selectionPath } from './features/archive/paths.js';
import { getMode, setMode } from './features/archive/mode.js';
import { mountViews } from './features/navigation/views.js';
import { mountResults } from './features/results/results.js';
import { mountResultView } from './features/results/result-view.js';
import { mountUpload } from './features/upload/upload.js';
import { mountDonate } from './features/donate/donate.js';

function restoreSelection(filtersReady) {
  filtersReady.then((filters) => {
    if (!filters) return;

    const selection = readSelection();
    if (!selection || selection.mode !== getMode()) return;

    const apply = () => {
      if (selection.mode !== getMode() || !selection.semester) return;

      if (selection.subject) {
        filters.selectSubject(selection.semester, selection.subject);
        return;
      }

      filters.semesterSelect.setValue(selection.semester, { notify: true });
    };

    if (selection.mode === 'notes' && filters.getCatalog().length === 0) {
      const onCatalog = (event) => {
        if (event.detail?.mode !== 'notes') return;
        document.removeEventListener('catalogchange', onCatalog);
        apply();
      };

      document.addEventListener('catalogchange', onCatalog);
      return;
    }

    apply();
  });
}

function syncSelectionUrl() {
  document.addEventListener('filterchange', (event) => {
    const { semester, subject, mode } = event.detail;
    if (document.documentElement.dataset.view) return;

    const path = selectionPath(semester, subject, mode);

    if (window.location.pathname !== path) {
      window.history.replaceState(null, '', path);
    }
  });
}

const initialSelection = readSelection();
setMode(initialSelection?.mode || 'pyq');

initTheme();
mountThemeToggle();
mountDrawer();
mountToast();

const papersPanel = mountPapers();
mountViews();
mountResults();
mountResultView();
mountUpload();
mountDonate();

document.addEventListener('papersopen', (event) => {
  papersPanel?.open({ ...event.detail, kind: 'pyq' });
});

document.addEventListener('notesopen', (event) => {
  papersPanel?.open({ ...event.detail, kind: 'notes' });
});

mountButtonGroup(getMode());
const filtersReady = mountFilters();

mountSearchSuggestions(filtersReady);
restoreSelection(filtersReady);
mountStatus(filtersReady);
mountNotifications();
initSplash(filtersReady);
updateAllFields();
syncSelectionUrl();
