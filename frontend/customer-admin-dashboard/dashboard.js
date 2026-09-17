(function(){'use strict';
  import('/customer-admin-dashboard/belm-main-mirror-v793.js?v=807-general-report')
    .catch(()=>null)
    .then(()=>import('/customer-admin-dashboard/general-report-nav-v807.js?v=807-general-report').catch(()=>null))
    .finally(()=>import('/customer-admin-dashboard/dashboard-core-v772.js?v=807-general-report'));
})();
