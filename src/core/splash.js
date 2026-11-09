const MIN_VISIBLE = 500;
const MAX_VISIBLE = 8000;

export function initSplash(...tasks) {
  const screen = document.querySelector('#splash-screen');
  if (!screen) return;

  const started = performance.now();
  let hidden = false;

  const hide = () => {
    if (hidden) return;
    hidden = true;
    clearTimeout(guard);
    screen.classList.add('is-hidden');
  };

  const guard = setTimeout(hide, MAX_VISIBLE);

  Promise.all([
    document.fonts.load('400 16px "Google Sans Flex"'),
    document.fonts.load('400 24px "Material Symbols Rounded"'),
    document.fonts.load('400 24px "Material Symbols Outlined"'),
    document.fonts.ready,
    ...tasks,
  ]).then(
    () => setTimeout(hide, Math.max(0, MIN_VISIBLE - (performance.now() - started))),
    hide,
  );
}
