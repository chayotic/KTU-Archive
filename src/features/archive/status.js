import cookieShape from 'beercss/dist/cdn/sided-cookie7.svg';
import { fetchMaintenance } from '../../services/archive.js';

const LABELS = {
  online: 'Server online',
  offline: 'Server offline',
  maintenance: 'Under Maintenance',
};

export function mountStatus(filtersReady, root = document) {
  const card = root.querySelector('[data-server-status]');
  const label = root.querySelector('[data-server-status-label]');
  if (!card || !label) return;

  card.style.setProperty('--md3-status-shape', `url("${cookieShape}")`);

  function setState(state) {
    card.dataset.state = state;
    label.textContent = LABELS[state];
    card.hidden = false;
  }

  Promise.all([filtersReady.catch(() => null), fetchMaintenance()]).then(
    ([filters, maintenance]) => {
      if (maintenance) setState('maintenance');
      else setState(filters ? 'online' : 'offline');
    },
  );
}
