import './theme.js';
import { handleRoute, navigateTo as routerNavigateTo, getPageFromPath, pageToPath } from './router.js';
import { initializeApp, performSearch, isPyqBusy } from './pyq.js';
import { fetchNotesSubjects, searchNotes, isNotesBusy } from './notes.js';
import { fullNotifications, renderAllNotifications, showNotifLoader } from './notifications.js';
import { showToast } from './utils.js';

function navigateTo(page) {
    routerNavigateTo(page);
    if (page === 'notifications') {
        if (fullNotifications.length > 0) {
            renderAllNotifications(fullNotifications);
        } else {
            const container = document.getElementById('notif-list-full');
            if (container && !container.querySelector('.notif-item')) {
                showNotifLoader();
            }
        }
    }
}

function toggleNotifBtn(page) {
    const btn = document.getElementById('notif-btn');
    if (!btn) return;
    const isMobile = window.innerWidth <= 768;
    btn.style.display = (page === 'notifications' && isMobile) ? 'none' : '';
}

const hash = location.hash.replace('#', '');
if (hash) {
    const path = pageToPath[hash] || `/${hash}`;
    history.replaceState({ page: hash }, '', path);
}
const page = getPageFromPath();
handleRoute(page);
toggleNotifBtn(page);
if (page === 'notifications' && fullNotifications.length > 0) {
    renderAllNotifications(fullNotifications);
} else if (page === 'notifications') {
    showNotifLoader();
}

window.addEventListener('popstate', () => {
    const p = getPageFromPath();
    handleRoute(p);
    toggleNotifBtn(p);
    if (p === 'notifications' && fullNotifications.length > 0) {
        renderAllNotifications(fullNotifications);
    } else if (p === 'notifications') {
        showNotifLoader();
    }
});

window.addEventListener('resize', () => {
    const p = getPageFromPath();
    toggleNotifBtn(p);
});

document.querySelectorAll('.sidebar-icons [data-page]').forEach(icon => {
    icon.addEventListener('click', () => {
        navigateTo(icon.dataset.page);
        document.querySelector('.sidebar-icons')?.classList.remove('open');
        document.querySelector('.sidebar-overlay')?.classList.remove('open');
    });
});

document.querySelector('.hamburger-icon')?.addEventListener('click', () => {
    document.querySelector('.sidebar-icons')?.classList.toggle('open');
    document.querySelector('.sidebar-overlay')?.classList.toggle('open');
});


document.querySelector('.sidebar-overlay')?.addEventListener('click', () => {
    document.querySelector('.sidebar-icons')?.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('open');
});



document.getElementById('notif-btn')?.addEventListener('click', () => navigateTo('notifications'));

document.addEventListener('click', (e) => {
    const viewAllBtn = document.getElementById('view-all-notif-btn');
    if (viewAllBtn && viewAllBtn.contains(e.target)) {
        navigateTo('notifications');
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (document.getElementById('pyq-section').style.display !== 'none') {
            const sem = document.getElementById('semester-select').getAttribute('data-selected-value');
            const subj = document.getElementById('subject-select').getAttribute('data-selected-value');
            if (sem && subj) {
                e.preventDefault();
                performSearch();
            }
        } else {
            const sem = document.getElementById('notes-semester-select').getAttribute('data-selected-value');
            const subj = document.getElementById('notes-subject-select').getAttribute('data-selected-value');
            if (sem && subj) {
                e.preventDefault();
                searchNotes();
            }
        }
    }
});

document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    const activate = () => {
        if (btn.classList.contains('active')) return;
        if (isPyqBusy() || isNotesBusy()) {
            showToast('Please wait for the current operation to finish');
            return;
        }
        document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.dataset.tab;
        document.getElementById('pyq-section').style.display = tab === 'pyq' ? '' : 'none';
        document.getElementById('notes-section').style.display = tab === 'notes' ? '' : 'none';

        if (tab === 'notes') {
            fetchNotesSubjects();
        }
    };
    btn.addEventListener('pointerdown', activate);
    btn.addEventListener('click', activate);
});

const donateBtn = document.getElementById('donate-btn');
const donateModal = document.getElementById('donate-modal');
const copyUpiBtn = document.getElementById('copy-upi-btn');

if (donateBtn && donateModal) {
    donateBtn.addEventListener('click', () => {
        donateModal.classList.add('active');
    });
}

if (donateModal) {
    donateModal.addEventListener('click', (e) => {
        if (e.target === donateModal) {
            donateModal.classList.remove('active');
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            donateModal.classList.remove('active');
        }
    });
}

if (copyUpiBtn) {
    copyUpiBtn.addEventListener('click', () => {
        const upiId = 'rohithpai@sib';
        navigator.clipboard.writeText(upiId).then(() => {
            showToast('UPI ID Copied');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = upiId;
            textarea.style.position = 'fixed';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                showToast('UPI ID Copied');
            } catch (err) {
                showToast('Failed to copy UPI ID');
            }
            document.body.removeChild(textarea);
        });
    });
}

initializeApp();
