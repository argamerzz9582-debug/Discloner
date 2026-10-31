/**
 * Theme bootstrap
 *
 * Loaded as an external script (rather than inline) so the server can serve a
 * strict Content-Security-Policy without 'unsafe-inline'. Applies the saved
 * theme before first paint to avoid a light/dark flash.
 */
(function () {
    try {
        var savedTheme = localStorage.getItem('discloner-theme');
        document.documentElement.setAttribute('data-theme', savedTheme === 'dark' ? 'dark' : 'light');
    } catch (e) {
        document.documentElement.setAttribute('data-theme', 'light');
    }
})();
