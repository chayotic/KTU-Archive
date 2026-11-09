let mode = 'pyq';
const listeners = new Set();

document.addEventListener('buttongroupchange', (event) => {
  setMode(event.detail?.value);
});

export function setMode(next) {
  if (next !== 'pyq' && next !== 'notes') return;
  if (next === mode) return;

  const previous = mode;
  mode = next;

  listeners.forEach((listener) => listener(mode, previous));
}

export function getMode() {
  return mode;
}

export function onModeChange(listener) {
  listeners.add(listener);
}
