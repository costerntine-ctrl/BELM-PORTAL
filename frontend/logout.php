<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Signing out — BELM</title></head>
<body><script>
(function(){
  ["belm_customer_token","belm_tech_token","belm_tech_user","belm_admin_token","belm_admin_user","belm_operator_token","belm_active_account_type","belm_preview_token"].forEach(function(k){try{localStorage.removeItem(k);}catch(e){}});
  try{sessionStorage.clear();}catch(e){}
  location.replace('/login');
})();
</script></body></html>
