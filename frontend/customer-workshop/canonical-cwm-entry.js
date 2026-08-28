/* V608 - Keep one canonical PORTAL-CWM home. /portal-cwm/ is the only home dashboard.
   /customer-workshop/ is an internal workspace and must be entered through OPEN WORKSHOP. */
(function () {
  const params = new URLSearchParams(window.location.search);
  const actor = String(params.get('actor') || '').toLowerCase();
  const hasValidWorkspaceEntry = actor === 'customer' || actor === 'belm';

  if (!hasValidWorkspaceEntry) {
    window.location.replace('/portal-cwm/');
    return;
  }

  document.documentElement.dataset.cwmWorkspace = 'true';

  /* Legacy workshop-v524.js still intercepts Store and Settings and tries to
     open inline views that are no longer present in the current CWM page.
     Route customer clicks to the dedicated customer-scoped pages first. */
  document.addEventListener('click', function (event) {
    if (actor !== 'customer') return;
    const store = event.target.closest('#storeLink');
    if (store) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = '/customer-store/';
      return;
    }
    const settings = event.target.closest('#cwmSettingsLink');
    if (settings) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = '/customer-settings-center/';
    }
  }, true);
})();
