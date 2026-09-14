document.addEventListener('DOMContentLoaded', function () {
  var shell = document.getElementById('belmShell');
  var sidebarToggle = document.getElementById('sidebarToggle');
  var themeToggle = document.getElementById('themeToggle');

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
      shell.classList.toggle('is-sidebar-open');
    });
  }

  // Operator used to keep a separate global `belm-theme` value. Load the same
  // per-account Theme Manager used by the rest of BELM so Light/Dark follows
  // the signed-in user and does not overwrite another person's preference.
  function ensureSharedTheme() {
    if (!document.querySelector('link[data-operator-shared-theme]')) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/theme-global.css?v=754-settings-audit';
      css.dataset.operatorSharedTheme = '1';
      document.head.appendChild(css);
    }
    return new Promise(function (resolve) {
      if (window.BELMTheme) { resolve(); return; }
      var existing = document.querySelector('script[data-operator-shared-theme]');
      if (existing) { existing.addEventListener('load', resolve, { once:true }); setTimeout(resolve, 1000); return; }
      var script = document.createElement('script');
      script.src = '/theme-manager.js?v=754-settings-audit';
      script.dataset.operatorSharedTheme = '1';
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }

  function paintThemeLabel() {
    if (!themeToggle) return;
    var dark = window.BELMTheme?.get?.() === 'dark' || document.documentElement.dataset.theme === 'dark';
    themeToggle.lastChild.textContent = dark ? ' Light mode' : ' Dark mode';
  }

  ensureSharedTheme().then(function () {
    paintThemeLabel();
    window.addEventListener('belm-theme-change', paintThemeLabel);
    if (themeToggle) {
      themeToggle.addEventListener('click', function () {
        if (window.BELMTheme?.toggle) window.BELMTheme.toggle();
        else {
          var dark = document.documentElement.dataset.theme === 'dark';
          document.documentElement.dataset.theme = dark ? 'light' : 'dark';
          paintThemeLabel();
        }
      });
    }
  });

  function updateClock() {
    var dateEl = document.getElementById('liveDate');
    var timeEl = document.getElementById('liveTime');
    if (!dateEl || !timeEl) return;
    var now = new Date();
    dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    timeEl.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  updateClock();
  setInterval(updateClock, 30000);
});
