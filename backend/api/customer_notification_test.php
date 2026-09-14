<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/mailer.php';
require_once __DIR__ . '/../config/whatsapp.php';

$customer = require_customer_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed.', 405);

$actorType = strtolower(trim((string)($customer['actorType'] ?? 'owner')));
$role = strtolower(trim((string)($customer['customerRole'] ?? '')));
if ($actorType !== 'owner' && !in_array($role, ['admin','customer_admin'], true)) {
    json_error('Only Customer Owner / Company Admin can test company notification channels.', 403);
}

$customerId = (string)($customer['id'] ?? '');
$body = body();
$channel = strtoupper(trim((string)($body['channel'] ?? '')));
if (!in_array($channel, ['EMAIL','WHATSAPP'], true)) json_error('Choose EMAIL or WHATSAPP.', 400);

$pdo = db();
$stmt = $pdo->prepare(
    'SELECT c.name,c.email,s.*
       FROM customers c
       LEFT JOIN customer_notification_settings s ON s.customer_id=c.id
      WHERE c.id=? AND c.deleted_at IS NULL AND c.is_active=1
      LIMIT 1'
);
$stmt->execute([$customerId]);
$row = $stmt->fetch();
if (!$row) json_error('Customer account is not active.', 404);

$companyName = trim((string)$row['name']) ?: 'Customer';
$subject = 'BELM Portal notification test - ' . $companyName;
$message = "This is a notification test from BELM Operations Portal.\n\nCompany: {$companyName}\nChannel: {$channel}\nTime: " . date('c') . "\n\nIf you received this message, the configured channel and destination are working.";

function test_log(string $channel, string $recipient, string $subject, string $message, string $status): void {
    try {
        db()->prepare(
            'INSERT INTO notification_logs(id,channel,recipient,subject,body,status,created_at) VALUES(?,?,?,?,?,?,NOW())'
        )->execute([uuid(), $channel, $recipient, $subject, $message, $status]);
    } catch (Throwable $ignored) {}
}

if ($channel === 'EMAIL') {
    // No settings row yet means the documented default (Email ON), not OFF.
    if ($row['email_enabled'] !== null && empty($row['email_enabled'])) {
        json_error('Customer email notifications are disabled in System Settings.', 409);
    }
    $recipients = [];
    $main = strtolower(trim((string)($row['email'] ?? '')));
    if (filter_var($main, FILTER_VALIDATE_EMAIL)) $recipients[$main] = $main;
    $extra = json_decode((string)($row['management_group_emails'] ?? '[]'), true);
    if (is_array($extra)) {
        foreach ($extra as $email) {
            $email = strtolower(trim((string)$email));
            if (filter_var($email, FILTER_VALIDATE_EMAIL)) $recipients[$email] = $email;
        }
    }
    if (!$recipients) json_error('No valid customer email recipient is configured.', 409);
    $sent = 0; $failed = 0;
    $replyTo = trim((string)($row['reply_to_email'] ?? ''));
    foreach (array_values($recipients) as $email) {
        try {
            send_email($email, $subject, $message, [], [], $replyTo !== '' ? $replyTo : null);
            test_log('EMAIL', $email, $subject, $message, 'SENT');
            $sent++;
        } catch (Throwable $error) {
            test_log('EMAIL', $email, $subject, $message, 'FAILED');
            error_log('Customer notification email test failed: ' . $error->getMessage());
            $failed++;
        }
    }
    if ($sent === 0) json_error('Email test failed for all configured recipients. Check BELM SMTP configuration.', 502);
    json_out(['ok'=>true,'channel'=>'EMAIL','sent'=>$sent,'failed'=>$failed,'message'=>'Email test sent to configured customer recipients.']);
}

if (empty($row['whatsapp_enabled'])) json_error('Customer WhatsApp alerts are disabled in System Settings.', 409);
$to = trim((string)($row['whatsapp_number'] ?? ''));
$group = trim((string)($row['whatsapp_group_name'] ?? ''));
$recipientLabel = $to !== '' ? $to : ($group !== '' ? $group : 'WhatsApp');
try {
    belm_send_whatsapp($to, $message, $group !== '' ? $group : null);
    test_log('WHATSAPP', $recipientLabel, $subject, $message, 'SENT');
    json_out(['ok'=>true,'channel'=>'WHATSAPP','sent'=>1,'failed'=>0,'message'=>'WhatsApp test accepted by the configured provider.']);
} catch (Throwable $error) {
    test_log('WHATSAPP', $recipientLabel, $subject, $message, 'FAILED');
    error_log('Customer WhatsApp notification test failed: ' . $error->getMessage());
    json_error($error->getMessage(), 502);
}
