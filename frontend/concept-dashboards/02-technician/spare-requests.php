<?php
header('Cache-Control: no-store, no-cache, must-revalidate');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>BELM Technician Spare Request</title>
<script src="/navigation-context-v763.js?v=763-role-flow"></script>
<link rel="stylesheet" href="/theme-global.css?v=54">
<script defer src="/theme-manager.js?v=54"></script>
<script defer src="/language-preferences.js?v=54"></script>
<script defer src="/belm-i18n.js?v=53"></script>
<link rel="stylesheet" href="/dashboard-preferences.css?v=54">
<script defer src="/dashboard-preferences.js?v=54"></script>
</head>
<body>
  <p>Opening the correct spare request workflow...</p>
  <script>
  (function () {
    function payload(token) {
      if (!token) return null;
      try {
        var raw = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        raw += '='.repeat((4 - raw.length % 4) % 4);
        return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(function (c) {
          return '%' + c.charCodeAt(0).toString(16).padStart(2, '0');
        }).join('')));
      } catch (_) { return null; }
    }
    var tech = payload(localStorage.getItem('belm_tech_token'));
    var customer = payload(localStorage.getItem('belm_customer_token'));
    var customerRole = String(customer && (customer.roleName || customer.customerRole || customer.role) || '').toLowerCase();
    var customerScoped = Boolean((tech && tech.isCustomerManaged) || customerRole.includes('technician'));
    location.replace(customerScoped
      ? '/technician-job-cards/'
      : '/spare-parts-manager/?view=requests&source=technician');
  }());
  </script>
  <noscript><a href="/technician-job-cards/">Open Job Cards</a></noscript>
</body>
</html>
