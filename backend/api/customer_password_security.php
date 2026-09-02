<?php
require_once __DIR__ . '/../config/helpers.php';

$customer = require_customer_auth();
if (($customer['actorType'] ?? 'owner') !== 'owner') {
    json_error('Only the Customer Owner / Admin can manage passwords.', 403);
}

$customerId = (string)$customer['id'];
$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

function password_security_accounts(PDO $pdo, string $customerId): array {
    $owner = $pdo->prepare('SELECT id,name,email FROM customers WHERE id=? AND deleted_at IS NULL AND is_active=1 LIMIT 1');
    $owner->execute([$customerId]);
    $ownerRow = $owner->fetch();
    $accounts = [];
    if ($ownerRow) {
        $accounts[] = [
            'id' => (string)$ownerRow['id'],
            'type' => 'owner',
            'name' => (string)$ownerRow['name'],
            'email' => (string)$ownerRow['email'],
            'role' => 'Customer Owner / Admin',
            'canDeletePassword' => false,
        ];
    }
    $stmt = $pdo->prepare('SELECT id,name,email,role,is_active FROM customer_users WHERE customer_id=? ORDER BY created_at ASC');
    $stmt->execute([$customerId]);
    foreach ($stmt->fetchAll() as $row) {
        $accounts[] = [
            'id' => (string)$row['id'],
            'type' => 'user',
            'name' => (string)$row['name'],
            'email' => (string)$row['email'],
            'role' => (string)$row['role'],
            'isActive' => !empty($row['is_active']),
            'canDeletePassword' => true,
        ];
    }
    return $accounts;
}

function require_customer_password_confirmation(array $customer, array $body): array {
    $adminPassword = (string)($body['adminPassword'] ?? '');
    $reason = trim((string)($body['reason'] ?? ''));
    if ($adminPassword === '') json_error('Enter the Customer Admin password.');
    if ($reason === '') json_error('Enter a reason for this password change.');
    if (mb_strlen($reason) > 500) json_error('Reason must be 500 characters or fewer.');

    // Reuse the portal-wide protected Edit PIN. The PIN itself is never exposed.
    require_edit_confirmation($customer, $body);

    assert_not_rate_limited('customer-password-security', (string)$customer['id'], 8, 15);
    $stmt = db()->prepare('SELECT name,email,password FROM customers WHERE id=? AND deleted_at IS NULL AND is_active=1 LIMIT 1');
    $stmt->execute([(string)$customer['id']]);
    $owner = $stmt->fetch();
    if (!$owner || !password_verify($adminPassword, (string)$owner['password'])) {
        record_failed_attempt('customer-password-security', (string)$customer['id']);
        json_error('Incorrect Customer Admin password.', 403);
    }
    clear_rate_limit('customer-password-security', (string)$customer['id']);
    return [
        'reason' => $reason,
        'actorName' => trim((string)($owner['name'] ?? 'Customer Admin')) ?: 'Customer Admin',
        'actorEmail' => trim((string)($owner['email'] ?? '')),
    ];
}

function customer_password_audit(PDO $pdo, string $customerId, string $actorName, string $action, string $targetName, string $targetEmail, string $reason): void {
    $message = $action . ' · ' . $targetName . ' (' . $targetEmail . ') · Reason: ' . $reason;
    try {
        $pdo->prepare('INSERT INTO customer_activity_logs (id,customer_id,actor_name,action,created_at) VALUES (?,?,?,?,NOW())')
            ->execute([uuid(), $customerId, $actorName, $message]);
    } catch (Throwable $ignored) {}
}

if ($method === 'GET') {
    json_out(['accounts' => password_security_accounts($pdo, $customerId)]);
}

if ($method !== 'POST') json_error('Method not allowed.', 405);
$body = body();
$action = strtolower(trim((string)($body['action'] ?? '')));
$targetType = strtolower(trim((string)($body['targetType'] ?? '')));
$targetId = trim((string)($body['targetId'] ?? ''));
if (!in_array($action, ['edit','delete'], true)) json_error('Choose Edit Password or Delete Password.');
if (!in_array($targetType, ['owner','user'], true) || $targetId === '') json_error('Select an account.');

$confirmation = require_customer_password_confirmation($customer, $body);

if ($targetType === 'owner') {
    if ($targetId !== $customerId) json_error('Owner account does not match this company.', 403);
    if ($action === 'delete') json_error('The Customer Owner password cannot be deleted. Use Edit Password instead.', 422);
    $targetStmt = $pdo->prepare('SELECT id,name,email FROM customers WHERE id=? AND deleted_at IS NULL AND is_active=1 LIMIT 1');
    $targetStmt->execute([$customerId]);
} else {
    $targetStmt = $pdo->prepare('SELECT id,name,email FROM customer_users WHERE id=? AND customer_id=? LIMIT 1');
    $targetStmt->execute([$targetId, $customerId]);
}
$target = $targetStmt->fetch();
if (!$target) json_error('Selected account was not found.', 404);

if ($action === 'edit') {
    $newPassword = (string)($body['newPassword'] ?? '');
    $confirmPassword = (string)($body['confirmPassword'] ?? '');
    if (strlen($newPassword) < 8) json_error('New password must contain at least 8 characters.');
    if ($newPassword !== $confirmPassword) json_error('New password and confirmation do not match.');
    $hash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
    if ($targetType === 'owner') {
        $pdo->prepare('UPDATE customers SET password=?,updated_at=NOW() WHERE id=?')->execute([$hash, $customerId]);
    } else {
        $pdo->prepare('UPDATE customer_users SET password=?,updated_at=NOW() WHERE id=? AND customer_id=?')->execute([$hash, $targetId, $customerId]);
    }
    customer_password_audit($pdo, $customerId, $confirmation['actorName'], 'Password edited', (string)$target['name'], (string)$target['email'], $confirmation['reason']);
    json_out(['ok'=>true,'message'=>'Password updated. The security action has been recorded in the audit log.']);
}

// "Delete Password" means invalidate the current credential without deleting
// the account or its historical records. The user can later receive a new
// password from Customer Admin or use Forgot Password/OTP.
$invalidHash = password_hash(bin2hex(random_bytes(32)), PASSWORD_BCRYPT, ['cost' => 12]);
$pdo->prepare('UPDATE customer_users SET password=?,updated_at=NOW() WHERE id=? AND customer_id=?')->execute([$invalidHash, $targetId, $customerId]);
customer_password_audit($pdo, $customerId, $confirmation['actorName'], 'Password deleted / credential invalidated', (string)$target['name'], (string)$target['email'], $confirmation['reason']);
json_out(['ok'=>true,'message'=>'Password deleted. The account record and history remain; the old password can no longer sign in.']);
