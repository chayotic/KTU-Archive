import { getMode } from '../archive/mode.js';

const VIEWS = {
  archive: { path: '/', title: 'KTU Archive' },
  results: { path: '/result', title: 'Fetch KTU Results' },
  'result-view': { path: '/result/view', title: 'Results' },
  notifications: { path: '/notifications', title: 'KTU Notifications' },
  upload: { path: '/upload', title: 'Upload Documents' },
  donate: { path: '/donate', title: 'Donate' },
};

let navigateToView = null;

export function navigateTo(view) {
  navigateToView?.(view);
}

function normalizePath(pathname) {
  return pathname.replace(/\/+$/, '') || '/';
}

function viewFromPath(pathname) {
  const path = normalizePath(pathname);
  return Object.keys(VIEWS).find((view) => VIEWS[view].path === path) || 'archive';
}

function viewPath(view) {
  if (view === 'archive') return getMode() === 'notes' ? '/notes' : '/';
  return VIEWS[view].path;
}

export function mountViews(root = document) {
  const donateTitle = root.querySelector('[data-donate-title]');
  const resultsTitle = root.querySelector('[data-results-title]');
  const resultViewTitle = root.querySelector('[data-result-view-title]');
  const notificationsTitle = root.querySelector('[data-notifications-page-title]');
  const uploadTitle = root.querySelector('[data-upload-title]');
  const homeTitle = root.querySelector('[data-home-title]');
  const links = [...root.querySelectorAll('[data-view-link]')];

  function paintActive(view) {
    const activeView = view === 'result-view' ? 'results' : view;
    root.querySelectorAll('.md3-drawer__item[data-view-link]').forEach((link) => {
      const active = link.dataset.viewLink === activeView;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function showView(view) {
    const next = VIEWS[view] ? view : 'archive';
    const entry = VIEWS[next];

    document.documentElement.dataset.view = next === 'archive' ? '' : next;
    document.title = entry.title;
    if (donateTitle && next === 'donate') {
      donateTitle.textContent = entry.title;
    }

    if (notificationsTitle && next === 'notifications') {
      notificationsTitle.textContent = entry.title;
    }

    if (uploadTitle && next === 'upload') {
      uploadTitle.textContent = entry.title;
    }
    paintActive(next);
  }

  function focusView(view, delay) {
    const target =
      view === 'archive'
        ? homeTitle
        : view === 'results'
          ? resultsTitle
          : view === 'result-view'
            ? resultViewTitle
            : view === 'notifications'
              ? notificationsTitle
              : view === 'upload'
                ? uploadTitle
                : donateTitle;
    if (!target) return;

    window.setTimeout(() => target.focus({ preventScroll: true }), delay);
  }

  function navigate(view) {
    const next = VIEWS[view] ? view : 'archive';
    const path = viewPath(next);
    const currentView = document.documentElement.dataset.view || 'archive';
    const drawerOpen = document.documentElement.classList.contains('md3-drawer-open');

    if (currentView !== next || normalizePath(window.location.pathname) !== path) {
      window.history.pushState({ ktuView: 'view', view: next }, '', path);
    }

    showView(next);
    focusView(next, drawerOpen ? 360 : 0);
  }

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      if (
        event.button > 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const view = link.dataset.viewLink;
      if (!VIEWS[view]) return;

      event.preventDefault();
      navigate(view);
    });
  });

  navigateToView = navigate;

  window.addEventListener('popstate', (event) => {
    if (event.state?.ktuView === 'papers') {
      paintActive('archive');
      return;
    }

    if (event.state?.ktuView === 'view') {
      showView(event.state.view);
      return;
    }

    if (!event.state?.ktuView) {
      showView(viewFromPath(window.location.pathname));
    }
  });

  showView(viewFromPath(window.location.pathname));
}
