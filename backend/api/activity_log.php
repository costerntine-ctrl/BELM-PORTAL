<?php
require_once __DIR__ . '/../config/helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$payload = current_token_payload();
if (!$payload) json_error('Login required.', 401);

// POST /api/activity-log
// A successful unified login calls this once. Attendance is derived from login
// activity: first login = check-in, any login today = PRESENT. No manual check-in.
if ($method === 'POST') {
    $type = strtolower(trim((string)($payload['type'] ?? '')));
    $pdo = db();

    if ($type === 'staff') {
        $userId = trim((string)($payload['id'] ?? ''));
        if ($userId === '') json_error('Staff account is invalid.', 401);

        // Avoid duplicate LOGIN rows when a browser retries immediately.
        $dup = $pdo->prepare(
            "SELECT 1 FROM activity_logs
             WHERE user_id = ? AND UPPER(action) = 'LOGIN'
               AND created_at > NOW() - INTERVAL '60 seconds'
             LIMIT 1"
        );
        $dup->execute([$userId]);
        if (!$dup->fetchColumn()) {
            $pdo->prepare(
                "INSERT INTO activity_logs (id, user_id, action, entity, created_at)
                 VALUES (?, ?, 'LOGIN', 'attendance', NOW())"
            )->execute([uuid(), $userId]);
        }

        // Keep the existing attendance table as a daily summary, but make login
        // activity its source of truth. Existing first check-in is never replaced.
        $existing = $pdo->prepare(
            'SELECT id FROM attendance_records WHERE user_id = ? AND work_date = CURRENT_DATE ORDER BY check_in ASC NULLS LAST LIMIT 1'
        );
        $existing->execute([$userId]);
        $attendanceId = $existing->fetchColumn();
        if ($attendanceId) {
            $pdo->prepare(
                "UPDATE attendance_records
                 SET status = 'PRESENT', check_in = COALESCE(check_in, NOW())
                 WHERE id = ?"
            )->execute([$attendanceId]);
        } else {
            $pdo->prepare(
                "INSERT INTO attendance_records (id, user_id, work_date, status, check_in)
                 VALUES (?, ?, CURRENT_DATE, 'PRESENT', NOW())"
            )->execute([uuid(), $userId]);
        }

        json_out(['ok' => true, 'attendance' => 'PRESENT', 'source' => 'LOGIN_ACTIVITY']);
    }

    if ($type === 'customer') {
        $customerId = trim((string)($payload['id'] ?? ''));
        $actorName = trim((string)($payload['actorName'] ?? $payload['name'] ?? 'Customer')) ?: 'Customer';
        if ($customerId === '') json_error('Customer account is invalid.', 401);

        $dup = $pdo->prepare(
            "SELECT 1 FROM customer_activity_logs
             WHERE customer_id = ? AND actor_name = ? AND UPPER(action) = 'LOGIN'
               AND created_at > NOW() - INTERVAL '60 seconds'
             LIMIT 1"
        );
        $dup->execute([$customerId, $actorName]);
        if (!$dup->fetchColumn()) {
            $pdo->prepare(
                "INSERT INTO customer_activity_logs (id, customer_id, actor_name, action, created_at)
                 VALUES (?, ?, ?, 'LOGIN', NOW())"
            )->execute([uuid(), $customerId, $actorName]);
        }

        json_out(['ok' => true, 'attendance' => 'PRESENT', 'source' => 'LOGIN_ACTIVITY']);
    }

    json_error('This account type does not use login attendance.', 422);
}

// GET /api/activity-log?scope=attendance using a customer token returns CWM
// daily attendance for the owner and customer portal users.
if ($method === 'GET' && strtolower(trim((string)($_GET['scope'] ?? ''))) === 'attendance') {
    if (strtolower(trim((string)($payload['type'] ?? ''))) !== 'customer') {
        json_error('Customer attendance is available inside CWM only.', 403);
    }

    $customerId = trim((string)($payload['id'] ?? ''));
    $pdo = db();
    $people = [];

    $ownerStmt = $pdo->prepare('SELECT name, email FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
    $ownerStmt->execute([$customerId]);
    if ($owner = $ownerStmt->fetch()) {
        $people[] = ['name' => $owner['name'], 'email' => $owner['email'], 'role' => 'Owner'];
    }

    $usersStmt = $pdo->prepare(
        'SELECT name, email, role FROM customer_users WHERE customer_id = ? AND is_active = 1 ORDER BY name ASC'
    );
    $usersStmt->execute([$customerId]);
    foreach ($usersStmt->fetchAll() as $row) {
        $people[] = ['name' => $row['name'], 'email' => $row['email'], 'role' => $row['role']];
    }

    $loginStmt = $pdo->prepare(
        "SELECT MIN(created_at) AS first_login, MAX(created_at) AS last_login
         FROM customer_activity_logs
         WHERE customer_id = ? AND actor_name = ? AND UPPER(action) = 'LOGIN'
           AND (created_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date =
               (NOW() AT TIME ZONE 'Africa/Dar_es_Salaam')::date"
    );

    $rows = [];
    $present = 0;
    foreach ($people as $person) {
        $loginStmt->execute([$customerId, $person['name']]);
        $login = $loginStmt->fetch() ?: [];
        $first = $login['first_login'] ?? null;
        $last = $login['last_login'] ?? null;
        $status = $first ? 'PRESENT' : 'NO_LOGIN';
        if ($first) $present++;
        $rows[] = [
            ...$person,
            'status' => $status,
            'firstLogin' => $first,
            'lastLogin' => $last,
        ];
    }

    json_out([
        'date' => (new DateTimeImmutable('now', new DateTimeZone('Africa/Dar_es_Salaam')))->format('Y-m-d'),
        'source' => 'LOGIN_ACTIVITY',
        'present' => $present,
        'noLogin' => max(0, count($rows) - $present),
        'total' => count($rows),
        'rows' => $rows,
    ]);
}

// Existing BELM staff Activity Log view.
$user = require_auth();
require_page_access($user, 'overview');
if ($method !== 'GET') json_error('Unknown request', 404);

$limit = (int)($_GET['limit'] ?? 100);
if ($limit <= 0) $limit = 100;
if ($limit > 500) $limit = 500;
$entity = trim((string)($_GET['entity'] ?? ''));

if ($entity !== '') {
    $stmt = db()->prepare(
        'SELECT a.id, a.action, a.entity, a.entity_id, a.metadata, a.created_at,
                u.name AS user_name, u.email AS user_email
         FROM activity_logs a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.entity = ?
         ORDER BY a.created_at DESC
         LIMIT ?'
    );
    $stmt->bindValue(1, $entity);
    $stmt->bindValue(2, $limit, PDO::PARAM_INT);
    $stmt->execute();
} else {
    $stmt = db()->prepare(
        'SELECT a.id, a.action, a.entity, a.entity_id, a.metadata, a.created_at,
                u.name AS user_name, u.email AS user_email
         FROM activity_logs a
         LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.created_at DESC
         LIMIT ?'
    );
    $stmt->bindValue(1, $limit, PDO::PARAM_INT);
    $stmt->execute();
}

json_out($stmt->fetchAll());
