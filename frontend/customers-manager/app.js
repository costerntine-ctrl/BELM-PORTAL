// BELM Customer Overview runtime entrypoint.
// The page loads /customers-manager/app.js; keep the full customer dashboard
// implementation in manager.js and bootstrap it here so the existing card,
// communication history, machine, provider and customer-management workflows
// stay in one source of truth.
(function loadBelmCustomerOverviewRuntime() {
  if (window.__belmCustomerOverviewRuntimeLoading) return;
  window.__belmCustomerOverviewRuntimeLoading = true;

  const script = document.createElement("script");
  script.src = "/customers-manager/manager.js?v=725-customer-dashboard-cards";
  script.async = false;
  script.dataset.belmCustomerOverviewRuntime = "true";

  script.addEventListener("error", function () {
    window.__belmCustomerOverviewRuntimeLoading = false;
    const grid = document.getElementById("customerGrid");
    if (grid) {
      grid.innerHTML = '<div class="empty"><strong>Customer dashboards could not start.</strong><br>Please refresh the page. If the problem continues, check the customer overview runtime deployment.</div>';
    }
  });

  (document.body || document.documentElement).appendChild(script);
})();
