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
    $stmt = db()->prepare('SELECT t.*, c.name AS customer_name FROM tasks t LEFT JOIN customers c ON c.id = t.customer_id WHERE t.assigned_to_id = ? ORDER BY t.created_at DESC');
    $stmt->execute([$_GET['userId']]);
    json_out($stmt->fetchAll());
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
        'SELECT u.assigned_customer_id, r.name AS role_name
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
            json_error('This Technician does not have an assigned customer.', 422);
        }
        // A Technician task always follows the customer assigned on that
        // Technician account, even if the legacy admin form sends another ID.
        $customerId = $assignee['assigned_customer_id'];
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
    log_activity($user['id'], 'created', 'task', $newId, ['title' => $title]);
    json_out(['id' => $newId], 201);
}

if ($method === 'PUT') {
    $stmt = db()->prepare("UPDATE tasks SET status='DONE' WHERE id=?");
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) json_error('Task not found.', 404);
    log_activity($user['id'], 'completed', 'task', $id);
    json_out(['ok' => true]);
}

if ($method === 'DELETE') {
    db()->prepare('DELETE FROM tasks WHERE id = ?')->execute([$id]);
    log_activity($user['id'], 'deleted', 'task', $id);
    json_out(null, 204);
}

json_error('Unknown request', 404);
