<?php
header('Content-Type: application/manifest+json');
$customer = strtolower(trim((string)($_GET['customer'] ?? '')));
if ($customer !== '' && !preg_match('/^(?:[a-z0-9][a-z0-9-]{0,35}|[a-z0-9][a-z0-9-]{0,24}@belm)$/', $customer)) $customer = '';
$name = $customer === '' ? 'BELM Operations' : 'BELM - ' . strtoupper(str_replace('-', ' ', $customer));
$start = '/login';
echo json_encode([
  'name'=>$name,'short_name'=>'BELM','start_url'=>$start,'scope'=>'/','display'=>'standalone',
  'background_color'=>'#071827','theme_color'=>'#071827',
  'icons'=>[
    ['src'=>'/belm-app-icon-192.png','sizes'=>'192x192','type'=>'image/png','purpose'=>'any maskable'],
    ['src'=>'/belm-app-icon-512.png','sizes'=>'512x512','type'=>'image/png','purpose'=>'any maskable']
  ]
], JSON_UNESCAPED_SLASHES);
