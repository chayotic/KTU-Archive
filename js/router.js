export const pageToPath = {
    'archive': '/',
    'fetch-results': '/result',
    'notifications': '/notifications',
    'upload': '/upload',
};

const pathToPage = Object.fromEntries(
    Object.entries(pageToPath).map(([page, path]) => [path, page])
);

export function navigateTo(page) {
    const path = pageToPath[page] || `/${page}`;
    history.pushState({ page }, '', path);
    handleRoute(page);
}

export function handleRoute(page) {
    page = page || 'archive';

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-icons .material-symbols-outlined').forEach(i => i.classList.remove('active'));

    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) targetPage.classList.add('active');

    window.scrollTo(0, 0);

    const targetIcon = document.querySelector(`.sidebar-icons [data-page="${page}"]`);
    if (targetIcon) {
        targetIcon.classList.add('active');
    }

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
        const path = pageToPath[page] || `/${page}`;
        canonical.href = `https://ktu-archive.vercel.app${path}`;
    }
}

export function getPageFromPath() {
    const path = location.pathname.replace(/\/$/, '') || '/';
    return pathToPage[path] || 'archive';
}
