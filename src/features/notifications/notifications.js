import { showToast } from '../../components/toast.js';

const API_BASE = 'https://ktu-announcements-api-wxk8.onrender.com';
const REQUEST_TIMEOUT = 25000;
const DOWNLOAD_TIMEOUT = 60000;
const LIMIT = 3;
const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatDate(value) {
  return DATE_FORMAT.format(new Date(`${value}T00:00:00`));
}

function normalizeNotification(notification) {
  return {
    title: notification.title,
    date: notification.date,
    description: notification.description_text ?? '',
    attachments: (notification.attachments ?? []).map((attachment) => ({
      name: attachment.name || 'Attachment',
      url: `${API_BASE}/download/${attachment.encrypt_id}`,
    })),
  };
}

async function requestAnnouncements() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${API_BASE}/announcements?`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const result = await response.json();
    if (!result?.success || !Array.isArray(result.data)) return null;

    return result.data
      .map(normalizeNotification)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    console.warn('Failed to fetch notifications', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadAttachment(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const contentType = response.headers.get('content-type') || '';

    if (
      !response.ok ||
      /application\/json|text\/html/i.test(contentType)
    ) {
      return null;
    }

    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function attachmentFileName(attachment, index, total) {
  const raw =
    (attachment.name || 'Attachment')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .trim() || 'Attachment';
  const suffix = total > 1 ? ` ${index + 1}` : '';
  const extension = /\.[a-z0-9]{2,5}$/i.test(raw) ? '' : '.pdf';
  return `${raw}${suffix}${extension}`;
}

function createAttachment(attachment, index, total) {
  const link = document.createElement('a');
  link.className = 'button small border';
  if (index === 0) link.classList.add('left-round');
  if (index === total - 1) link.classList.add('right-round');
  link.href = attachment.url;
  link.setAttribute('aria-label', `Download attachment ${index + 1} of ${total}`);

  const icon = document.createElement('i');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'download';

  const loader = document.createElement('span');
  loader.className = 'shape loading-indicator md3-attachment__loader';
  loader.setAttribute('aria-hidden', 'true');
  loader.hidden = true;

  const label = document.createElement('span');
  label.textContent = 'Attachment';

  link.append(icon, loader, label);

  let busy = false;
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    if (busy) return;

    busy = true;
    link.setAttribute('aria-busy', 'true');
    icon.hidden = true;
    loader.hidden = false;

    const blob = await downloadAttachment(attachment.url);

    if (!blob) {
      showToast('Attachment could not be downloaded. Please try again later.');
    } else {
      triggerDownload(blob, attachmentFileName(attachment, index, total));
    }

    busy = false;
    link.removeAttribute('aria-busy');
    icon.hidden = false;
    loader.hidden = true;
  });

  return link;
}

function createNotification(notification) {
  const item = document.createElement('li');
  item.className = 'md3-notification';

  const date = document.createElement('time');
  date.className = 'md3-notification__date';
  date.dateTime = notification.date;
  date.textContent = formatDate(notification.date);

  const title = document.createElement('h2');
  title.className = 'md3-notification__title';
  title.textContent = notification.title;

  item.append(date, title);

  if (notification.description) {
    const body = document.createElement('p');
    body.className = 'md3-notification__body';
    body.textContent = notification.description;
    item.append(body);
  }

  if (notification.attachments.length > 0) {
    const wrapper = document.createElement('div');
    wrapper.className = 'beer md3-notification__attachments';

    const group = document.createElement('nav');
    group.className = 'group connected';

    const total = notification.attachments.length;
    notification.attachments.forEach((attachment, index) => {
      group.append(createAttachment(attachment, index, total));
    });

    wrapper.append(group);
    item.append(wrapper);
  }

  return item;
}

export async function mountNotifications(root = document) {
  const loading = root.querySelector('[data-notifications-loading]');
  const error = root.querySelector('[data-notifications-error]');
  const list = root.querySelector('[data-notifications-list]');
  const pageStatus = root.querySelector('[data-notifications-page-status]');
  const pageList = root.querySelector('[data-notifications-page-list]');
  if (!loading || !error || !list) return;

  const notifications = await requestAnnouncements();

  loading.hidden = true;

  if (!notifications) {
    error.hidden = false;

    if (pageStatus) {
      pageStatus.textContent = 'Failed to fetch notifications';
      pageStatus.hidden = false;
    }
    return;
  }

  if (notifications.length === 0) {
    error.hidden = false;

    if (pageStatus) {
      pageStatus.textContent = 'No notifications yet';
      pageStatus.hidden = false;
    }
    return;
  }

  notifications.slice(0, LIMIT).forEach((notification) => {
    list.append(createNotification(notification));
  });

  list.hidden = false;

  if (!pageList) return;

  notifications.forEach((notification) => {
    pageList.append(createNotification(notification));
  });

  pageList.hidden = false;
  if (pageStatus) pageStatus.hidden = true;
}
