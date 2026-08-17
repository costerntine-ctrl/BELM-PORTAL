<?php
$customer = strtolower(trim((string)($_GET['customer'] ?? '')));
if ($customer !== '' && !preg_match('/^(?:[a-z0-9][a-z0-9-]{0,35}|[a-z0-9][a-z0-9-]{0,24}@belm)$/', $customer)) {
    http_response_code(404); exit('Invalid app link');
}
$portalPath = $customer !== '' ? '/app/' . rawurlencode($customer) : '/app/';
$portalUrl = 'https://portal.belmgeneraltech.co.tz' . $portalPath;
$manifestUrl = '/belm_manifest.php?customer=' . rawurlencode($customer);
?>
<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#071827"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>BELM Operations</title><link rel="manifest" href="<?=htmlspecialchars($manifestUrl,ENT_QUOTES)?>"><link rel="apple-touch-icon" href="/belm-app-icon-192.png">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#071827}iframe{border:0;width:100%;height:100%;display:block}#install{position:fixed;right:14px;bottom:14px;z-index:5;border:0;border-radius:999px;padding:11px 14px;background:#159447;color:white;font:700 13px Arial;box-shadow:0 6px 20px #0004;display:none}</style>
</head><body>
<iframe src="<?=htmlspecialchars($portalUrl,ENT_QUOTES)?>" title="BELM Operations" allow="camera; microphone; clipboard-read; clipboard-write; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>
<button id="install">Install App</button>
<script>if('serviceWorker'in navigator)navigator.serviceWorker.register('/belm-sw.js').catch(()=>{});let p;const b=document.getElementById('install');addEventListener('beforeinstallprompt',e=>{e.preventDefault();p=e;b.style.display='block'});b.onclick=async()=>{if(!p)return;p.prompt();await p.userChoice;p=null;b.style.display='none'};</script>
</body></html>
