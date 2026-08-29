<?php
require_once __DIR__ . '/../config/helpers.php';
$user = require_auth();
require_page_access($user, 'settings');
if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_error('Method not allowed', 405);
$email = trim((string)(getenv('SMTP_HOST') ?: '')) !== '' && trim((string)(getenv('SMTP_FROM_EMAIL') ?: '')) !== '';
$whatsapp = trim((string)(getenv('BELM_WHATSAPP_API_URL') ?: '')) !== '' && trim((string)(getenv('BELM_WHATSAPP_API_TOKEN') ?: '')) !== '';
$sms = trim((string)(getenv('BELM_SMS_API_URL') ?: '')) !== '' && trim((string)(getenv('BELM_SMS_API_TOKEN') ?: '')) !== '';
json_out(['email'=>$email,'whatsapp'=>$whatsapp,'sms'=>$sms]);
