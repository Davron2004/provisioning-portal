// Runs before the first paint. Keep the storage key and values in sync with ThemeService.
(function () {
  try {
    var mode = localStorage.getItem('pp.theme');
    if (mode === 'light' || mode === 'dark') {
      document.documentElement.setAttribute('data-theme', mode);
      // Match the browser's toolbar to the chosen theme (see THEME_COLORS in ThemeService).
      var color = mode === 'dark' ? '#101417' : '#f6fafe';
      document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
        meta.setAttribute('content', color);
      });
    }
  } catch (e) {
    // Storage can be unavailable (privacy mode); fall back to the OS preference.
  }
})();
