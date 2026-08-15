<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;
$isTechnician = ($user['roleName'] ?? '') === 'Technician';

if ($isTechnician) {
    if ($method === 'GET') {
        if (($_GET['userId'] ?? '') !== ($user['id'] ?? '')) {
            json_error('You can only view your own tasks.', 403);
        }
    } elseif ($method === 'PUT') {
        $stmt = db()->prepare('SELECT assigned_to_id FROM tasks WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->fetchColumn() !== ($user['id'] ?? '')) {
            json_error('This task is not assigned to you.', 403);
        }
    } else {
        json_error('Technicians cannot create or delete tasks.', 403);
    }
} else {
    require_page_access($user, 'roles');
}

if ($method === 'GET') {
    $stmt = db()->prepare(
        'SELECT t.*, c.name AS customer_name, u.assigned_customer_id AS home_customer_id, hc.name AS home_customer_name
         FROM tasks t
         LEFT JOIN customers c ON c.id = t.customer_id
         JOIN users u ON u.id = t.assigned_to_id
         LEFT JOIN customers hc ON hc.id = u.assigned_customer_id
         WHERE t.assigned_to_id = ? ORDER BY t.created_at DESC'
    );
    $stmt->execute([$_GET['userId']]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        $row['temporaryOverride'] = !empty($row['customer_id'])
            && !empty($row['home_customer_id'])
            && (string)$row['customer_id'] !== (string)$row['home_customer_id'];
        $row['homeCustomerName'] = $row['home_customer_name'] ?? null;
        unset($row['home_customer_id'], $row['home_customer_name']);
    }
    unset($row);
    json_out($rows);
}

if ($method === 'POST') {
    $b = body();
    $title = trim((string)($b['title'] ?? ''));
    $assignedToId = trim((string)($b['assignedToId'] ?? ''));
    $customerId = trim((string)($b['customerId'] ?? ''));
    $priority = strtoupper(trim((string)($b['priority'] ?? 'NORMAL')));
    if ($title === '') json_error('Task title is required.');
    if (!in_array($priority, ['LOW', 'NORMAL', 'HIGH', 'URGENT'], true)) {
        json_error('Invalid task priority.');
    }
    $stmt = db()->prepare(
        'SELECT u.assigned_customer_id, u.is_customer_managed, r.name AS role_name
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.id = ? AND u.deleted_at IS NULL AND u.is_active = 1'
    );
    $stmt->execute([$assignedToId]);
    $assignee = $stmt->fetch();
    if (!$assignee) json_error('Select an active system user.', 422);
    if ($customerId !== '') {
        $stmt = db()->prepare('SELECT 1 FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
        $stmt->execute([$customerId]);
        if (!$stmt->fetch()) json_error('Selected customer is not available.', 422);
    }
    if ($assignee['role_name'] === 'Technician') {
        if (!$assignee['assigned_customer_id']) {
            json_error('This Technician does not have a permanent/home customer.', 422);
        }
        $homeCustomerId = (string)$assignee['assigned_customer_id'];
        if ($customerId === '') {
            $customerId = $homeCustomerId;
        } elseif ($customerId !== $homeCustomerId) {
            if (!empty($assignee['is_customer_managed'])) {
                json_error('Customer-managed Technicians cannot be borrowed for another customer.', 403);
            }
            if (!belm_can_override_technician_customer($user)) {
                json_error('Only BELM Super Admin or Engineer can temporarily assign this Technician to another customer.', 403);
            }
        }
    }
    $newId = uuid();
    db()->prepare("INSERT INTO tasks (id, assigned_to_id, customer_id, title, description, due_date, priority, status, created_by, created_at) VALUES (?,?,?,?,?,?,?,'PENDING',?,NOW())")
        ->execute([
            $newId,
            $assignedToId,
            $customerId !== '' ? $customerId : null,
            $title,
            trim((string)($b['description'] ?? '')) ?: null,
            $b['dueDate'] ?? null,
            $priority,
            $user['name'],
        ]);
    json_out(['id' => $newId], 201);
}

if ($method === 'PUT') {
    $stmt = db()->prepare("UPDATE tasks SET status='DONE' WHERE id=?");
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) json_error('Task not found.', 404);
    json_out(['ok' => true]);
}

if ($method === 'DELETE') {
    db()->prepare('DELETE FROM tasks WHERE id = ?')->execute([$id]);
    json_out(null, 204);
}

json_error('Unknown request', 404);
