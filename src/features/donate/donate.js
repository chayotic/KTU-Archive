import { showToast } from '../../components/toast.js';

const UPI_ID = 'rohithpai@sib';

async function copyUpi() {
  try {
    await navigator.clipboard.writeText(UPI_ID);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = UPI_ID;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();

    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }
}

export function mountDonate(root = document) {
  const button = root.querySelector('[data-donate-copy]');
  const icon = root.querySelector('[data-donate-copy-icon]');
  if (!button) return;

  button.addEventListener('click', async () => {
    const copied = await copyUpi();
    showToast(copied ? 'UPI ID copied' : 'Could not copy the UPI ID', {
      variant: copied ? 'success' : 'error',
    });

    if (!copied || !icon) return;

    icon.textContent = 'check';
    window.setTimeout(() => {
      icon.textContent = 'content_copy';
    }, 1600);
  });
}
