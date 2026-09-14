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
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_customer_notification_settings_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
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

function customer_can_edit_company_settings(array $customer): bool {
  $actorType = strtolower(trim((string)($customer['actorType'] ?? 'owner')));
  if ($actorType === 'owner') return true;
  $role = strtolower(trim((string)($customer['customerRole'] ?? '')));
  return in_array($role, ['admin', 'customer_admin'], true);
}

function customer_settings_context(PDO $pdo, string $customerId): array {
  $stmt = $pdo->prepare('SELECT name,is_machinery_admin,workshop_module_active FROM customers WHERE id=? AND deleted_at IS NULL AND is_active=1 LIMIT 1');
  $stmt->execute([$customerId]);
  $company = $stmt->fetch();
  if (!$company) json_error('Customer account is no longer active.', 404);

  $independent = !empty($company['is_machinery_admin']);
  $technicianEnabled = $independent && belm_customer_technician_entitled($customerId);
  $emailReady = trim((string)(getenv('SMTP_HOST') ?: '')) !== '' && trim((string)(getenv('SMTP_FROM_EMAIL') ?: getenv('SMTP_USER') ?: '')) !== '';
  $whatsappReady = trim((string)(getenv('BELM_WHATSAPP_API_URL') ?: '')) !== '' && trim((string)(getenv('BELM_WHATSAPP_API_TOKEN') ?: '')) !== '';

  return [
    'companyName' => (string)$company['name'],
    'serviceControl' => [
      'mode' => $independent ? 'CUSTOMER_INDEPENDENT' : 'BELM_SERVICE_PROVIDER',
      'label' => $independent ? 'Customer Independent Workshop' : 'BELM Service Provider',
      'customerIndependent' => $independent,
      'belmServiceProvider' => !$independent,
      'customerTechnicianEnabled' => $technicianEnabled,
      'customerMachineManagementEnabled' => $independent,
      // This is deliberately not customer-editable. In provider mode, a customer
      // may choose whether its own management receives copies, but it cannot
      // switch off BELM's technical escalation responsibility.
      'belmTechnicalEscalationRequired' => !$independent,
    ],
    'providers' => [
      'email' => ['configured' => $emailReady, 'managedBy' => 'BELM System Settings'],
      'whatsapp' => ['configured' => $whatsappReady, 'managedBy' => 'BELM System Settings'],
    ],
    'restrictions' => [
      'bankController' => false,
      'belmSparePartSelling' => false,
      'providerCredentialsEditable' => false,
    ],
  ];
}

function settings_payload(?array $row, array $context, bool $canEdit): array {
  return [
    'alerts' => [
      // These switches control CUSTOMER copies/routing. They never override the
      // mandatory BELM technical escalation shown in serviceControl.
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
    'canEdit' => $canEdit,
    'companyName' => $context['companyName'],
    'serviceControl' => $context['serviceControl'],
    'providers' => $context['providers'],
    'restrictions' => $context['restrictions'],
    'updatedBy' => $row['updated_by'] ?? null,
    'updatedAt' => $row['updated_at'] ?? null,
  ];
}

$context = customer_settings_context($pdo, $customerId);
$canEdit = customer_can_edit_company_settings($customer);

if ($method === 'GET') {
  $stmt = $pdo->prepare('SELECT * FROM customer_notification_settings WHERE customer_id=? LIMIT 1');
  $stmt->execute([$customerId]);
  json_out(settings_payload($stmt->fetch() ?: null, $context, $canEdit));
}

if ($method !== 'POST' && $method !== 'PUT') json_error('Method not allowed.', 405);
if (!$canEdit) {
  json_error('Only Customer Owner / Company Admin can change company-level System Settings.', 403);
}

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

$waNumber = trim((string)($wa['number'] ?? ''));
if ($waNumber !== '' && !preg_match('/^[+0-9 ()-]{7,30}$/', $waNumber)) {
  json_error('Enter a valid WhatsApp phone number, for example +2557XXXXXXXX.');
}

$values = [
  !empty($alerts['critical']),
  !empty($alerts['service']),
  !empty($alerts['breakdown']),
  !empty($alerts['procurement']),
  !empty($wa['enabled']),
  $waNumber ?: null,
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
$result = settings_payload($stmt->fetch() ?: null, $context, true);
json_out(['ok'=>true,'settings'=>$result]);
