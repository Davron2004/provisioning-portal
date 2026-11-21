// Runs before the first paint. Keep the storage key and values in sync with ThemeService.
(function () {
  try {
    var mode = localStorage.getItem('pp.theme');
    if (mode === 'light' || mode === 'dark') {
      document.documentElement.setAttribute('data-theme', mode);
    }
  } catch (e) {
    // Storage can be unavailable (privacy mode); fall back to the OS preference.
  }
})();
