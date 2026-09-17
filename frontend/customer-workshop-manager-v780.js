(function () {
  'use strict';

  // V795: Customer Workshop Manager uses the BELM Workshop Manager dashboard
  // as the visual source of truth. Keep customer URLs/data/API scope, but use
  // the exact BELM Workshop Manager stylesheet so both dashboards stay visually
  // mirrored instead of drifting into separate designs.
  const mirrorStyle = document.querySelector('link[href^="/customer-workshop-manager-v778.css"]');
  if (mirrorStyle) {
    mirrorStyle.href = '/concept-dashboards/11-workshop-manager/assets/css/belm-workshop-manager.css?v=795-customer-mirror';
  }
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