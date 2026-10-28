(function () {
  // Public embeds deliberately do not read or write browser storage.
  if (/\/embed(?:\/|$)/.test(location.pathname)) return;
  var root = document.documentElement;
  var query = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  var mode = 'auto';
  try { var stored = localStorage.getItem('datatug.theme.v1'); if (stored === 'light' || stored === 'dark') mode = stored; } catch (e) {}
  function apply() {
    var choice = root.getAttribute('data-theme-mode') || mode;
    var dark = choice === 'dark' || (choice === 'auto' && !!query && query.matches);
    root.classList.toggle('ion-palette-dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
  }
  root.setAttribute('data-theme-mode', mode);
  apply();
  if (query && query.addEventListener) query.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', function () {
    var select = document.getElementById('theme-mode');
    if (!select) return;
    select.value = mode;
    select.addEventListener('change', function () {
      if (['light', 'dark', 'auto'].indexOf(select.value) < 0) return;
      mode = select.value;
      root.setAttribute('data-theme-mode', mode);
      try { localStorage.setItem('datatug.theme.v1', mode); } catch (e) {}
      apply();
    });
  });
})();
