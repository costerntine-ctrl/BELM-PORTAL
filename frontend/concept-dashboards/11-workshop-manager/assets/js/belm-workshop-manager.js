(function () {
  "use strict";

  // Workshop Manager must use the same personal Light/Dark preference as the
  // rest of BELM Portal. The live dashboard previously treated the moon icon
  // as a link to System Settings, so clicking it never changed the theme.
  function installThemeAssets() {
    if (!document.querySelector('link[data-belm-workshop-theme]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/theme-global.css?v=727-workshop-theme-switch';
      link.setAttribute('data-belm-workshop-theme', '1');
      document.head.appendChild(link);
    }

    if (!document.getElementById('belmWorkshopDarkThemeOverrides')) {
      var style = document.createElement('style');
      style.id = 'belmWorkshopDarkThemeOverrides';
      style.textContent = [
        'html[data-theme="dark"]{--page-bg:#09111f;--border:#2a3950;--text-dark:#eef4fb;--text-body:#c7d2df;--text-muted:#98a8bb;--blue-bg:#102640;--green-bg:#10291f;--amber-bg:#30290f;--gray-bg:#172234;--blue-icon-bg:#173c65;--green-icon-bg:#17482f;--amber-icon-bg:#53420f;--gray-icon-bg:#26354a;--shadow:0 8px 28px rgba(0,0,0,.18)}',
        'html[data-theme="dark"] .main{background:#09111f!important}',
        'html[data-theme="dark"] .topheader{background:linear-gradient(180deg,#101b2e,#0d1728)!important;border-color:#2a3950!important}',
        'html[data-theme="dark"] .portal-title h1{color:#8eb8ff!important}',
        'html[data-theme="dark"] .portal-title p,html[data-theme="dark"] .portal-title .tagline{color:#9fb0c5!important}',
        'html[data-theme="dark"] .icon-btn{color:#dce7f3!important}',
        'html[data-theme="dark"] .user-copy strong{color:#eef4fb!important}',
        'html[data-theme="dark"] .welcome-head,html[data-theme="dark"] .panel,html[data-theme="dark"] .info-panel,html[data-theme="dark"] .datetime-box,html[data-theme="dark"] .tool-mini-card,html[data-theme="dark"] .machine-frame-shell{background:#111b2e!important;border-color:#2a3950!important;color:#e6edf7!important}',
        'html[data-theme="dark"] .wm-stat-card{border-color:#2a3950!important;color:#e6edf7!important}',
        'html[data-theme="dark"] .wm-stat-card--blue{background:#102640!important}',
        'html[data-theme="dark"] .wm-stat-card--green{background:#10291f!important}',
        'html[data-theme="dark"] .wm-stat-card--amber{background:#30290f!important}',
        'html[data-theme="dark"] .wm-stat-card--red{background:#35191f!important}',
        'html[data-theme="dark"] .status-box{background:#10291f!important;border-color:#285d46!important}',
        'html[data-theme="dark"] .status-box strong{color:#8fe4b7!important}',
        'html[data-theme="dark"] .status-box span{color:#78c99d!important}',
        'html[data-theme="dark"] .datetime-box strong,html[data-theme="dark"] .wm-stat-label,html[data-theme="dark"] .wm-stat-value,html[data-theme="dark"] .tech-name,html[data-theme="dark"] .tool-mini-name,html[data-theme="dark"] .tool-mini-pct,html[data-theme="dark"] .alert-row2-title{color:#eef4fb!important}',
        'html[data-theme="dark"] .datetime-box span,html[data-theme="dark"] .wm-stat-sub,html[data-theme="dark"] .welcome-left p,html[data-theme="dark"] .alert-row2-sub,html[data-theme="dark"] .alert-row2-date{color:#98a8bb!important}',
        'html[data-theme="dark"] .data-table th{background:#0d1728!important;color:#aab9ca!important;border-color:#2a3950!important}',
        'html[data-theme="dark"] .data-table td,html[data-theme="dark"] .schedule-row,html[data-theme="dark"] .alert-row2{border-color:#26354a!important}',
        'html[data-theme="dark"] .frame-status{color:#98a8bb!important;border-color:#2a3950!important}'
      ].join('');
      document.head.appendChild(style);
    }

    // A hidden sentinel tells the global theme manager that this dashboard
    // already owns its theme control, preventing a second floating toggle.
    if (!document.querySelector('[data-belm-workshop-theme-sentinel]')) {
      var sentinel = document.createElement('button');
      sentinel.type = 'button';
      sentinel.hidden = true;
      sentinel.tabIndex = -1;
      sentinel.setAttribute('aria-hidden', 'true');
      sentinel.setAttribute('data-belm-theme-toggle', '1');
      sentinel.setAttribute('data-belm-workshop-theme-sentinel', '1');
      document.body.appendChild(sentinel);
    }

    if (!window.BELMTheme && !document.querySelector('script[data-belm-workshop-theme-manager]')) {
      var script = document.createElement('script');
      script.src = '/theme-manager.js?v=727-workshop-theme-switch';
      script.async = false;
      script.setAttribute('data-belm-workshop-theme-manager', '1');
      script.addEventListener('load', function () {
        if (window.BELMTheme && window.BELMTheme.refresh) window.BELMTheme.refresh();
        syncThemeButton();
      });
      document.body.appendChild(script);
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyFallbackTheme(theme) {
    var safe = theme === 'dark' ? 'dark' : 'light';
    var root = document.documentElement;
    root.setAttribute('data-theme', safe);
    root.classList.toggle('dark', safe === 'dark');
    root.style.colorScheme = safe;
    try { localStorage.setItem('belm_theme', safe); } catch (_) {}
    syncThemeButton();
  }

  function syncThemeButton() {
    var button = document.getElementById('themeToggle');
    if (!button) return;
    var dark = currentTheme() === 'dark';
    button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    button.title = dark ? 'Light mode' : 'Dark mode';
    button.setAttribute('aria-pressed', dark ? 'true' : 'false');
    button.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';
  }

  function toggleTheme() {
    if (window.BELMTheme && typeof window.BELMTheme.toggle === 'function') {
      Promise.resolve(window.BELMTheme.toggle()).finally(syncThemeButton);
      return;
    }
    applyFallbackTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  }

  // Capture phase is intentional: an older live-dashboard listener redirected
  // this same button to System Settings. Stop it before that handler can run.
  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('#themeToggle') : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleTheme();
  }, true);

  window.addEventListener('belm-theme-change', syncThemeButton);

  installThemeAssets();

  document.addEventListener('DOMContentLoaded', function () {
    installThemeAssets();
    syncThemeButton();

    function updateClock() {
      var dateEl = document.getElementById('liveDate');
      var timeEl = document.getElementById('liveTime');
      if (!dateEl || !timeEl) return;
      var now = new Date();
      dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      timeEl.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    updateClock();
    setInterval(updateClock, 30000);
  });
})();
