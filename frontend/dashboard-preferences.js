/* Shared personal controls for every signed-in dashboard. */
(function () {
  'use strict';
  if (window.__belmDashboardPreferences) return;
  window.__belmDashboardPreferences = true;
  function boot() {
    if (!window.BELMSession?.current() || document.getElementById('belmDashboardPreferences')) return;
    const root = document.createElement('details');
    root.id = 'belmDashboardPreferences';
    root.className = 'belm-dashboard-preferences';
    root.dataset.noTranslate = '';
    root.innerHTML = '<summary aria-label="Appearance and language settings">⚙ Appearance / Lugha / 语言</summary><section class="belm-preferences-panel" aria-label="Personal display settings"><h2>Appearance / Muonekano / 外观</h2><div class="belm-preferences-theme"><button type="button" data-theme-choice="light">☀ Light / Mwanga / 浅色</button><button type="button" data-theme-choice="dark">☾ Dark / Giza / 深色</button></div><div data-personal-language></div><button type="button" data-close-preferences>Close / Funga / 关闭</button></section>';
    document.body.appendChild(root);
    window.BelmLanguagePreferences?.mount(root.querySelector('[data-personal-language]'));
    // Older settings markup attempted to mount before deferred scripts loaded.
    const settings = document.getElementById('personalLanguagePreference');
    if (settings) window.BelmLanguagePreferences?.mount(settings);
    root.querySelector('[data-close-preferences]').addEventListener('click', () => { root.open = false; root.querySelector('summary').focus(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && root.open) { root.open = false; root.querySelector('summary').focus(); } });
    window.BELMTheme?.updateLabels();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
