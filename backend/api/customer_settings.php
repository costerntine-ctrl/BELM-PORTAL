<?php
require_once __DIR__ . '/../config/helpers.php';

$customer = require_customer_auth();
$customerId = (string)$customer['id'];
$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

$pdo->exec("CREATE TABLE IF NOT EXISTS customer_notification_settings (
  customer_id VARCHAR(64) PRIMARY KEY,
  critical_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  service_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  breakdown_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  procurement_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_number VARCHAR(80),
  whatsapp_group_name VARCHAR(160),
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_from_name VARCHAR(160),
  reply_to_email VARCHAR(255),
  management_group_emails TEXT,
  updated_by VARCHAR(160),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
)");

function settings_decode_emails($value): array {
  if ($value === null || $value === '') return [];
  $decoded = json_decode((string)$value, true);
  if (!is_array($decoded)) return [];
  $out = [];
  foreach ($decoded as $email) {
    $email = strtolower(trim((string)$email));
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) $out[] = $email;
  }
  return array_values(array_unique($out));
}

function settings_payload(?array $row): array {
  return [
    'alerts' => [
      'critical' => $row ? (bool)$row['critical_alerts_enabled'] : true,
      'service' => $row ? (bool)$row['service_alerts_enabled'] : true,
      'breakdown' => $row ? (bool)$row['breakdown_alerts_enabled'] : true,
      'procurement' => $row ? (bool)$row['procurement_alerts_enabled'] : true,
    ],
    'whatsapp' => [
      'enabled' => $row ? (bool)$row['whatsapp_enabled'] : false,
      'number' => $row['whatsapp_number'] ?? '',
      'groupName' => $row['whatsapp_group_name'] ?? '',
    ],
    'email' => [
      'enabled' => $row ? (bool)$row['email_enabled'] : true,
      'fromName' => $row['email_from_name'] ?? '',
      'replyTo' => $row['reply_to_email'] ?? '',
    ],
    'managementGroupEmails' => settings_decode_emails($row['management_group_emails'] ?? null),
    'updatedBy' => $row['updated_by'] ?? null,
    'updatedAt' => $row['updated_at'] ?? null,
  ];
}

if ($method === 'GET') {
  $stmt = $pdo->prepare('SELECT * FROM customer_notification_settings WHERE customer_id=? LIMIT 1');
  $stmt->execute([$customerId]);
  $row = $stmt->fetch() ?: null;
  json_out(settings_payload($row));
}

if ($method !== 'POST' && $method !== 'PUT') json_error('Method not allowed.', 405);
$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) json_error('Invalid request body.');

$alerts = is_array($body['alerts'] ?? null) ? $body['alerts'] : [];
$wa = is_array($body['whatsapp'] ?? null) ? $body['whatsapp'] : [];
$email = is_array($body['email'] ?? null) ? $body['email'] : [];
$groupEmailsRaw = is_array($body['managementGroupEmails'] ?? null) ? $body['managementGroupEmails'] : [];
$groupEmails = [];
foreach ($groupEmailsRaw as $value) {
  $value = strtolower(trim((string)$value));
  if ($value === '') continue;
  if (!filter_var($value, FILTER_VALIDATE_EMAIL)) json_error('Invalid management group email: ' . $value);
  $groupEmails[] = $value;
}
$groupEmails = array_values(array_unique($groupEmails));
$replyTo = strtolower(trim((string)($email['replyTo'] ?? '')));
if ($replyTo !== '' && !filter_var($replyTo, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid Reply-To email.');

$values = [
  !empty($alerts['critical']),
  !empty($alerts['service']),
  !empty($alerts['breakdown']),
  !empty($alerts['procurement']),
  !empty($wa['enabled']),
  trim((string)($wa['number'] ?? '')) ?: null,
  trim((string)($wa['groupName'] ?? '')) ?: null,
  !empty($email['enabled']),
  trim((string)($email['fromName'] ?? '')) ?: null,
  $replyTo ?: null,
  json_encode($groupEmails),
  trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer Admin')) ?: 'Customer Admin',
];

$stmt = $pdo->prepare("INSERT INTO customer_notification_settings (
 customer_id,critical_alerts_enabled,service_alerts_enabled,breakdown_alerts_enabled,procurement_alerts_enabled,
 whatsapp_enabled,whatsapp_number,whatsapp_group_name,email_enabled,email_from_name,reply_to_email,management_group_emails,updated_by,updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
ON CONFLICT (customer_id) DO UPDATE SET
 critical_alerts_enabled=EXCLUDED.critical_alerts_enabled,
 service_alerts_enabled=EXCLUDED.service_alerts_enabled,
 breakdown_alerts_enabled=EXCLUDED.breakdown_alerts_enabled,
 procurement_alerts_enabled=EXCLUDED.procurement_alerts_enabled,
 whatsapp_enabled=EXCLUDED.whatsapp_enabled,
 whatsapp_number=EXCLUDED.whatsapp_number,
 whatsapp_group_name=EXCLUDED.whatsapp_group_name,
 email_enabled=EXCLUDED.email_enabled,
 email_from_name=EXCLUDED.email_from_name,
 reply_to_email=EXCLUDED.reply_to_email,
 management_group_emails=EXCLUDED.management_group_emails,
 updated_by=EXCLUDED.updated_by,
 updated_at=NOW()");
$stmt->execute(array_merge([$customerId], $values));

$stmt = $pdo->prepare('SELECT * FROM customer_notification_settings WHERE customer_id=? LIMIT 1');
$stmt->execute([$customerId]);
json_out(['ok'=>true,'settings'=>settings_payload($stmt->fetch() ?: null)]);
