(function () {
  'use strict';

  // Roles & Users is a Customer Admin / Main Dashboard control. Keep the
  // Workshop Manager sidebar focused only on workshop operations.
  const rolesUsersLink = document.querySelector('.sidebar-nav a[href="/customer-users/"]');
  if (rolesUsersLink) rolesUsersLink.remove();

  import('/customer-workshop-manager-core-v794.js?v=794').catch(function (error) {
    console.warn('Customer Workshop Manager core load failed:', error);
  });
})();
