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

    // V323: My Tasks is a live work inbox for Technicians. Job Cards are not
    // copied into the tasks table (which can drift or duplicate); instead they
    // are projected here from digital_job_cards, the assignment source of truth.
    // This keeps Engineering dispatch, My Job Cards and My Tasks synchronized.
    if ($isTechnician) {
        $jobStmt = db()->prepare(
            "SELECT j.id,j.technician_id,j.customer_id,j.machine_id,j.job_card_no,j.title,j.fault_description,
                    j.due_date,j.priority,j.status,j.issued_by_name,j.created_at,
                    bc.current_stage,c.name AS customer_name,m.brand,m.model,m.machine_type,
                    u.assigned_customer_id AS home_customer_id,hc.name AS home_customer_name
             FROM digital_job_cards j
             JOIN breakdown_cases bc ON bc.id=j.case_id
             JOIN customers c ON c.id=j.customer_id
             JOIN machines m ON m.id=j.machine_id
             JOIN users u ON u.id=j.technician_id
             LEFT JOIN customers hc ON hc.id=u.assigned_customer_id
             WHERE j.technician_id=?
             ORDER BY j.created_at DESC"
        );
        $jobStmt->execute([$_GET['userId']]);
        foreach ($jobStmt->fetchAll() as $job) {
            $jobStatus = strtoupper(trim((string)($job['status'] ?? 'ASSIGNED')));
            $machineLabel = trim((string)($job['brand'] ?? '').' '.(string)($job['model'] ?? ''));
            if ($machineLabel === '') $machineLabel = trim((string)($job['machine_type'] ?? '')) ?: 'Machine';
            $rows[] = [
                'id' => 'job-card:'.(string)$job['id'],
                'assigned_to_id' => $job['technician_id'],
                'customer_id' => $job['customer_id'],
                'title' => 'Job Card '.(string)$job['job_card_no'].' - '.(string)$job['title'],
                'description' => trim((string)($job['fault_description'] ?? '')) ?: (string)$job['title'],
                'due_date' => $job['due_date'],
                'priority' => $job['priority'] ?: 'NORMAL',
                'status' => in_array($jobStatus, ['COMPLETED','CANCELLED'], true) ? 'DONE' : 'PENDING',
                'created_by' => trim((string)($job['issued_by_name'] ?? '')) ?: 'BELM / Customer',
                'created_at' => $job['created_at'],
                'customer_name' => $job['customer_name'],
                'home_customer_id' => $job['home_customer_id'],
                'home_customer_name' => $job['home_customer_name'],
                'source_type' => 'JOB_CARD',
                'job_card_id' => $job['id'],
                'job_card_no' => $job['job_card_no'],
                'machine_id' => $job['machine_id'],
                'machine_label' => $machineLabel,
                'case_stage' => $job['current_stage'],
            ];
        }
    }

    foreach ($rows as &$row) {
        $row['temporaryOverride'] = !empty($row['customer_id'])
            && !empty($row['home_customer_id'])
            && (string)$row['customer_id'] !== (string)$row['home_customer_id'];
        $row['homeCustomerName'] = $row['home_customer_name'] ?? null;
        unset($row['home_customer_id'], $row['home_customer_name']);
    }
    unset($row);
    usort($rows, static function (array $a, array $b): int {
        return strcmp((string)($b['created_at'] ?? ''), (string)($a['created_at'] ?? ''));
    });
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
    // BELM task assignment never reaches customer-owned accounts. Customer Admin /
    // Workshop Manager owns assignment of customer-managed staff inside the customer
    // workspace; BELM Admin/Engineer assigns only BELM employees.
    if (!empty($assignee['is_customer_managed'])) {
        json_error('BELM Admin/Engineer can assign tasks only to BELM employees. Customer-managed staff must be assigned by Customer Admin / Workshop Manager.', 403);
    }
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
