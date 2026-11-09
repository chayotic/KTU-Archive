let toast = null;
let message = null;
let timer = 0;
let activeDuration = 5000;
let drag = null;

function resetToastStyles() {
  if (!toast) return;

  toast.classList.remove('is-dragging');
  toast.style.removeProperty('transition');
  toast.style.removeProperty('transform');
  toast.style.removeProperty('opacity');
}

function hideToast() {
  if (!toast) return;

  toast.hidden = true;
  resetToastStyles();
}

function restartTimer() {
  window.clearTimeout(timer);
  timer = window.setTimeout(hideToast, activeDuration);
}

function dismissToast() {
  if (!toast || toast.hidden) return;

  window.clearTimeout(timer);
  toast.classList.remove('is-dragging');
  toast.style.transition =
    'transform 160ms cubic-bezier(0.31, 0.94, 0.34, 1), opacity 160ms cubic-bezier(0.31, 0.94, 0.34, 1)';
  toast.style.transform = 'translateY(120%)';
  toast.style.opacity = '0';
  timer = window.setTimeout(hideToast, 160);
}

function endDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;

  const endY = Number.isFinite(event.clientY) ? event.clientY : drag.lastY;
  const distance = Math.max(0, endY - drag.startY);
  const elapsed = Math.max(1, performance.now() - drag.startTime);
  const velocity = distance / elapsed;

  toast.releasePointerCapture?.(drag.id);
  drag = null;
  toast.classList.remove('is-dragging');

  if (distance > 56 || (distance > 16 && velocity > 0.5)) {
    dismissToast();
    return;
  }

  toast.style.transition =
    'transform 160ms cubic-bezier(0.31, 0.94, 0.34, 1), opacity 160ms cubic-bezier(0.31, 0.94, 0.34, 1)';
  toast.style.transform = 'translateY(0)';
  toast.style.opacity = '1';
  window.setTimeout(() => {
    if (!drag) resetToastStyles();
  }, 160);
  restartTimer();
}

export function mountToast(root = document) {
  toast = root.querySelector('[data-toast]');
  message = root.querySelector('[data-toast-message]');
  if (!toast) return;

  toast.addEventListener('pointerdown', (event) => {
    if (toast.hidden || event.button > 0) return;

    window.clearTimeout(timer);
    drag = {
      id: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      startTime: performance.now(),
    };
    toast.classList.add('is-dragging');
    toast.style.animation = 'none';
    toast.style.transition = 'none';
    toast.setPointerCapture?.(event.pointerId);
  });

  toast.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;

    drag.lastY = event.clientY;
    const distance = Math.max(0, event.clientY - drag.startY);
    toast.style.transform = `translateY(${distance}px)`;
    toast.style.opacity = String(
      Math.max(0, 1 - distance / (toast.offsetHeight * 2)),
    );
  });

  toast.addEventListener('pointerup', endDrag);
  toast.addEventListener('pointercancel', (event) => {
    if (!drag || event.pointerId !== drag.id) return;

    drag = null;
    toast.classList.remove('is-dragging');
    resetToastStyles();
    restartTimer();
  });
}

export function showToast(text, { duration = 5000, variant = 'error' } = {}) {
  if (!toast || !message) return;

  toast.dataset.variant = variant;
  message.textContent = text;
  activeDuration = duration;
  window.clearTimeout(timer);
  resetToastStyles();
  toast.style.removeProperty('animation');
  toast.hidden = false;
  restartTimer();
}
