export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    const themeIcon = document.getElementById('theme-icon');
    const sidebarThemeIcon = document.getElementById('sidebar-theme-icon');
    const githubIcon = document.getElementById('github-icon');

    if (theme === 'dark') {
        if (themeIcon) themeIcon.textContent = 'light_mode';
        if (sidebarThemeIcon) sidebarThemeIcon.textContent = 'light_mode';
        if (githubIcon) githubIcon.src = '/assets/github/GitHub-dark.svg';
    } else {
        if (themeIcon) themeIcon.textContent = 'dark_mode';
        if (sidebarThemeIcon) sidebarThemeIcon.textContent = 'dark_mode';
        if (githubIcon) githubIcon.src = '/assets/github/GitHub-light.svg';
    }
}

export function toggleTheme(originEl) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';

    if (!document.startViewTransition) {
        setTheme(newTheme);
        return;
    }

    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        document.startViewTransition(() => {
            setTheme(newTheme);
        });
        return;
    }

    const el = originEl || document.getElementById('theme-toggle-btn');
    if (!el) {
        setTheme(newTheme);
        return;
    }

    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
        setTheme(newTheme);
    });

    transition.ready.then(() => {
        document.documentElement.animate(
            {
                clipPath: [
                    `circle(0px at ${x}px ${y}px)`,
                    `circle(${endRadius}px at ${x}px ${y}px)`,
                ],
            },
            {
                duration: 450,
                easing: 'ease-in-out',
                pseudoElement: '::view-transition-new(root)',
            }
        );
    });

    transition.finished.then(() => {
        document.documentElement.style.overflow = '';
    });
}

const savedTheme = localStorage.getItem('theme') || 'light';
setTheme(savedTheme);

document.getElementById('theme-toggle-btn')?.addEventListener('click', (e) => toggleTheme(e.currentTarget));
document.getElementById('sidebar-theme-icon')?.addEventListener('click', (e) => toggleTheme(e.currentTarget));
