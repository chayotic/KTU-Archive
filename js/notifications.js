import { NOTIF_CACHE_KEY, NOTIF_LIMIT } from './constants.js';
import { escapeHtml } from './utils.js';
import { getPageFromPath } from './router.js';

export let fullNotifications = [];
let notifFeed = document.getElementById('notif-feed');
let notifList = document.getElementById('notif-list');
let notifBtn = document.getElementById('notif-btn');

function setNotifMessage(msg) {
    if (notifList) {
        notifList.innerHTML = `<div class="notif-message">${msg}</div>`;
    }
    const notifFull = document.getElementById('notif-list-full');
    if (notifFull) {
        notifFull.innerHTML = `<div class="notif-message">${msg}</div>`;
    }
}

let notifRetryInterval = null;
let dotInterval = null;
let hasLoadedOnce = false;

function startDotAnimation() {
    let dots = 0;
    dotInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        setNotifMessage('Trying to fetch notifications' + '.'.repeat(dots));
    }, 500);
}

function stopDotAnimation() {
    if (dotInterval) {
        clearInterval(dotInterval);
        dotInterval = null;
    }
}

export function fetchNotifications() {
    if (!hasLoadedOnce && !notifRetryInterval) {
        setNotifMessage('Trying to fetch notifications');
        startDotAnimation();
        if (notifFeed) notifFeed.style.display = 'block';
        if (notifBtn) notifBtn.style.display = 'flex-start';
        notifRetryInterval = setInterval(fetchNotifications, 10000);
    }

    fetch('https://ktu-announcements-api-wxk8.onrender.com/announcements?')
        .then(response => {
            if (!response.ok) throw new Error('API server returned error status');
            return response.json();
        })
        .then(result => {
            if (result && result.success && Array.isArray(result.data)) {
                const sorted = result.data.sort((a, b) => new Date(b.date) - new Date(a.date));
                localStorage.setItem(NOTIF_CACHE_KEY, JSON.stringify({ data: sorted, timestamp: Date.now() }));
                stopDotAnimation();
                renderNotifications(sorted);
                if (!hasLoadedOnce) {
                    hasLoadedOnce = true;
                    if (notifRetryInterval) {
                        clearInterval(notifRetryInterval);
                        notifRetryInterval = null;
                    }
                }
            }
        })
        .catch(error => {
            console.warn('Failed to fetch notifications:', error);
        });
}

function renderNotifications(notifications) {
    fullNotifications = notifications;

    if (!notifications || notifications.length === 0) {
        if (notifFeed) notifFeed.style.display = 'none';
        if (notifBtn) notifBtn.style.display = 'none';
        return;
    }

    if (notifFeed) notifFeed.style.display = 'block';
    if (notifBtn) notifBtn.style.display = 'flex-start';

    renderNotifList();

    if (getPageFromPath() === 'notifications') {
        renderAllNotifications(notifications);
    }
}

function renderNotifList() {
    notifList.innerHTML = '';
    const items = fullNotifications.slice(0, NOTIF_LIMIT);

    items.forEach(n => {
        const date = new Date(n.date).toLocaleDateString('en-IN', {
            day: '2-digit', month: '2-digit', year: '2-digit'
        });

        const bodyContent = n.description_html || `<p>${escapeHtml(n.description_text || n.title)}</p>`;

        let attachmentsHtml = '';
        if (Array.isArray(n.attachments) && n.attachments.length > 0) {
            const attachmentLinks = n.attachments.map(att => {
                const downloadUrl = `https://ktu-announcements-api-wxk8.onrender.com/download/${att.encrypt_id}`;
                const fileName = att.filename || 'Attachment';
                const shortName = fileName.length > 20 ? fileName.substring(0, 17) + '...' : fileName;
                return `<a href="${downloadUrl}" target="_self" class="notif-attachment-link">
                            <span class="material-symbols-outlined" style="font-size: 14px;">download</span>
                            ${escapeHtml(shortName)}
                        </a>`;
            }).join('');
            attachmentsHtml = `<div class="notif-attachments">${attachmentLinks}</div>`;
        }

        const notifItem = document.createElement('div');
        notifItem.className = 'notif-item';
        notifItem.innerHTML = `
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-body">${bodyContent}</div>
            <div class="notif-row">
                <span class="notif-date">${date}</span>
                ${attachmentsHtml}
            </div>
        `;
        notifList.appendChild(notifItem);
    });

    const viewAllBtn = document.getElementById('view-all-notif-btn');
    if (!viewAllBtn) return;

    if (fullNotifications.length > NOTIF_LIMIT) {
        viewAllBtn.style.display = 'block';
        viewAllBtn.querySelector('.button-text').textContent = 'View All Notifications';
    } else {
        viewAllBtn.style.display = 'none';
    }
}

export function renderAllNotifications(notifications) {
    const container = document.getElementById('notif-list-full');
    if (!container) return;
    container.innerHTML = '';
    notifications.forEach(n => {
        const date = new Date(n.date).toLocaleDateString('en-IN', {
            day: '2-digit', month: '2-digit', year: '2-digit'
        });
        const bodyContent = n.description_html || `<p>${escapeHtml(n.description_text || n.title)}</p>`;
        let attachmentsHtml = '';
        if (Array.isArray(n.attachments) && n.attachments.length > 0) {
            const attachmentLinks = n.attachments.map(att => {
                const downloadUrl = `https://ktu-announcements-api-wxk8.onrender.com/download/${att.encrypt_id}`;
                const fileName = att.filename || 'Attachment';
                const shortName = fileName.length > 20 ? fileName.substring(0, 17) + '...' : fileName;
                return `<a href="${downloadUrl}" target="_self" class="notif-attachment-link"><span class="material-symbols-outlined" style="font-size: 14px;">download</span>${escapeHtml(shortName)}</a>`;
            }).join('');
            attachmentsHtml = '<div class="notif-attachments">' + attachmentLinks + '</div>';
        }
        const item = document.createElement('div');
        item.className = 'notif-item';
        item.innerHTML = `
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-body">${bodyContent}</div>
            <div class="notif-row">
                <span class="notif-date">${date}</span>
                ${attachmentsHtml}
            </div>`;
        container.appendChild(item);
    });
}
