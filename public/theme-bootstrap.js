/**
 * Theme bootstrap
 *
 * Loaded as an external script (rather than inline) so the server can serve a
 * strict Content-Security-Policy without 'unsafe-inline'. Applies the saved
 * theme before first paint to avoid a light/dark flash, and falls back to the
 * operating system preference on a first visit.
 */
(function () {
    var theme = null;

    try {
        var savedTheme = localStorage.getItem('discloner-theme');
        if (savedTheme === 'dark' || savedTheme === 'light') {
            theme = savedTheme;
        }
    } catch (e) {}

    if (!theme) {
        try {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                theme = 'dark';
            }
        } catch (e) {}
    }

    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
})();
