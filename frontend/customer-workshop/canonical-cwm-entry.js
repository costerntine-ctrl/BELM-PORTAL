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
})();
