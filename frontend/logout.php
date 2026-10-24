<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Signing out — BELM</title><script src="/navigation-context-v763.js?v=763-role-flow"></script>
<link rel="stylesheet" href="/theme-global.css?v=54">
<script defer src="/theme-manager.js?v=54"></script>
<script defer src="/language-preferences.js?v=54"></script>
<script defer src="/belm-i18n.js?v=53"></script>
<link rel="stylesheet" href="/dashboard-preferences.css?v=54">
<script defer src="/dashboard-preferences.js?v=54"></script>
</head>
<body><script>
(function(){
  ["belm_customer_token","belm_tech_token","belm_tech_user","belm_admin_token","belm_admin_user","belm_operator_token","belm_active_account_type","belm_preview_token"].forEach(function(k){try{localStorage.removeItem(k);}catch(e){}});
  try{sessionStorage.clear();}catch(e){}
  location.replace('/login?signed_out=1');
})();
</script></body></html>
