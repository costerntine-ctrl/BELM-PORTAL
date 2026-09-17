(function(){'use strict';
  Promise.allSettled([import('/role-theme-selector-v809.js?v=809-every-role'),import('/customer-company-role-brand-v810.js?v=810-company-role')])
    .then(()=>import('/customer-admin-dashboard/belm-main-mirror-v793.js?v=809-every-role'))
    .catch(()=>null)
    .then(()=>import('/customer-admin-dashboard/general-report-nav-v807.js?v=807-general-report').catch(()=>null))
    .finally(()=>import('/customer-admin-dashboard/dashboard-core-v772.js?v=807-general-report'));
})();
