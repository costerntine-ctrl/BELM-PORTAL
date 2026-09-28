(function () {
  'use strict';

  // V795: the HTML loads the BELM Workshop Manager stylesheet directly so
  // Customer and BELM workshop dashboards cannot drift during initial render.
  document.documentElement.classList.add('customer-workshop-belm-mirror');

  // Roles & Users remains a Customer Admin / Main Dashboard control. The
  // Workshop Manager mirror keeps the BELM workshop navigation structure but
  // does not grant Customer Admin account-management functions.
  const rolesUsersLink = document.querySelector('.sidebar-nav a[href="/customer-users/"]');
  if (rolesUsersLink) rolesUsersLink.remove();

  import('/customer-workshop-manager-core-v794.js?v=795').catch(function (error) {
    console.warn('Customer Workshop Manager core load failed:', error);
  });
})();