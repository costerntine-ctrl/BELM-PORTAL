/* V605 - Keep one canonical PORTAL-CWM home. /portal-cwm/ is the only home dashboard.
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

  /*
   * CWM Store routing fix.
   * workshop-v524.js still contains the legacy inline-store handler which
   * calls showView('store'). The current CWM home no longer contains the
   * cwmStoreView section, so that handler prevents the real /customer-store/
   * link from opening and makes the button look frozen.
   *
   * Capture the Store link before the legacy bubbling handler and navigate
   * to the dedicated, customer-scoped Store & Tools page.
   */
  document.addEventListener('click', function (event) {
    const link = event.target.closest('#storeLink');
    if (!link) return;
    if (actor !== 'customer') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.href = '/customer-store/';
  }, true);
})();
