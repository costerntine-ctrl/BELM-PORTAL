<?php
require_once __DIR__ . '/../config/helpers.php';

$customer = require_customer_auth();
$method = $_SERVER['REQUEST_METHOD'];
$sub = $_GET['sub'] ?? '';
$sub2 = $_GET['sub2'] ?? '';
$sub3 = $_GET['sub3'] ?? '';

// ---- Dashboard ------------------------------------------------------------
if ($sub === 'dashboard') {
    $stmt = db()->prepare('SELECT * FROM machines WHERE customer_id = ? AND deleted_at IS NULL');
    $stmt->execute([$customer['id']]);
    $machines = $stmt->fetchAll();
    $stmt = db()->prepare(
        'SELECT id, name, email, phone, portal_link
         FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
    );
    $stmt->execute([$customer['id']]);
    $profile = $stmt->fetch();
    if ($profile) $profile['portalUrl'] = customer_portal_url($profile['portal_link']);
    json_out(['customer' => $profile, 'machines' => $machines]);
}

// ---- Machine reports / service status / operation analysis ----------------
if ($sub === 'machines' && $sub2) {
    $machineId = $sub2;
    $stmt = db()->prepare('SELECT id FROM machines WHERE id = ? AND customer_id = ?');
    $stmt->execute([$machineId, $customer['id']]);
    if (!$stmt->fetch()) json_error('Not found', 404);

    if ($sub3 === 'reports') {
        $stmt = db()->prepare('SELECT * FROM checklist_reports WHERE machine_id = ? ORDER BY created_at DESC');
        $stmt->execute([$machineId]);
        json_out($stmt->fetchAll());
    }

    if ($sub3 === 'service-status') {
        require_once __DIR__ . '/checklist_reports_helpers.php';
        json_out(compute_service_status_helper($machineId));
    }

    if ($sub3 === 'operation-analysis') {
        $stmt = db()->prepare('SELECT * FROM checklist_reports WHERE machine_id = ? ORDER BY created_at ASC');
        $stmt->execute([$machineId]);
        $reports = $stmt->fetchAll();

        $groundedCount = 0; $totalDowntimeMs = 0; $currentlyGrounded = false; $currentGroundedSinceMs = null;
        foreach ($reports as $i => $r) {
            if ($r['overall_status'] === 'RED') {
                $groundedCount++;
                $next = $reports[$i + 1] ?? null;
                $startMs = strtotime($r['created_at']) * 1000;
                $endMs = $next ? strtotime($next['created_at']) * 1000 : time() * 1000;
                $totalDowntimeMs += max(0, $endMs - $startMs);
                if (!$next) { $currentlyGrounded = true; $currentGroundedSinceMs = $startMs; }
            }
        }
        $totalChecks = count($reports);
        $firstMs = $totalChecks ? strtotime($reports[0]['created_at']) * 1000 : null;
        $totalTrackedMs = $firstMs ? max(1, time() * 1000 - $firstMs) : 1;
        $uptimePct = max(0, min(100, round(100 * (1 - $totalDowntimeMs / $totalTrackedMs))));

        json_out([
            'totalChecks' => $totalChecks, 'groundedCount' => $groundedCount, 'totalDowntimeMs' => $totalDowntimeMs,
            'avgDowntimeMs' => $groundedCount > 0 ? $totalDowntimeMs / $groundedCount : 0,
            'currentlyGrounded' => $currentlyGrounded, 'currentGroundedSinceMs' => $currentGroundedSinceMs, 'uptimePct' => $uptimePct,
        ]);
    }
}

// ---- Customer assistants ---------------------------------------------------
if ($sub === 'users' && $method === 'GET') {
    require_customer_owner($customer);
    $stmt = db()->prepare(
        'SELECT id, name, email, phone, role, is_active, created_at
         FROM customer_users WHERE customer_id = ? ORDER BY created_at DESC'
    );
    $stmt->execute([$customer['id']]);
    $assistants = $stmt->fetchAll();
    foreach ($assistants as &$assistant) {
        $assistant['isActive'] = (bool)$assistant['is_active'];
        unset($assistant['is_active']);
    }
    json_out($assistants);
}

if ($sub === 'users' && $method === 'POST') {
    require_customer_owner($customer);
    $b = body();
    $name = trim((string)($b['name'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');
    $phone = trim((string)($b['phone'] ?? ''));
    $role = strtolower(trim((string)($b['role'] ?? 'operator')));

    if ($name === '') json_error('Assistant name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid assistant email address.');
    if (strlen($password) < 8) json_error('Assistant password must contain at least 8 characters.');
    if (!in_array($role, ['operator', 'viewer'], true)) json_error('Assistant role must be Operator or Viewer.');

    $emailCheck = db()->prepare(
        'SELECT 1 FROM customers WHERE LOWER(email) = ?
         UNION ALL SELECT 1 FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM customer_users WHERE LOWER(email) = ?
         LIMIT 1'
    );
    $emailCheck->execute([$email, $email, $email]);
    if ($emailCheck->fetch()) json_error('This email address is already used by another portal account.', 409);

    $newId = uuid();
    db()->prepare(
        'INSERT INTO customer_users
         (id, customer_id, name, email, password, phone, role, is_active, created_at)
         VALUES (?,?,?,?,?,?,?,?,NOW())'
    )->execute([
        $newId,
        $customer['id'],
        $name,
        $email,
        password_hash($password, PASSWORD_BCRYPT),
        $phone !== '' ? $phone : null,
        $role,
        1,
    ]);
    json_out([
        'id' => $newId,
        'name' => $name,
        'email' => $email,
        'phone' => $phone !== '' ? $phone : null,
        'role' => $role,
        'isActive' => true,
    ], 201);
}

if ($sub === 'users' && $sub2 && $method === 'PUT') {
    require_customer_owner($customer);
    $stmt = db()->prepare('SELECT * FROM customer_users WHERE id = ? AND customer_id = ?');
    $stmt->execute([$sub2, $customer['id']]);
    $existing = $stmt->fetch();
    if (!$existing) json_error('Assistant not found.', 404);

    $b = body();
    $name = trim((string)($b['name'] ?? $existing['name']));
    $email = strtolower(trim((string)($b['email'] ?? $existing['email'])));
    $phone = trim((string)($b['phone'] ?? ($existing['phone'] ?? '')));
    $role = strtolower(trim((string)($b['role'] ?? $existing['role'])));
    $isActive = array_key_exists('isActive', $b) ? ((bool)$b['isActive'] ? 1 : 0) : (int)$existing['is_active'];
    $newPassword = (string)($b['password'] ?? '');

    if ($name === '') json_error('Assistant name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid assistant email address.');
    if (!in_array($role, ['operator', 'viewer'], true)) json_error('Assistant role must be Operator or Viewer.');
    if ($newPassword !== '' && strlen($newPassword) < 8) {
        json_error('New password must contain at least 8 characters.');
    }

    $emailCheck = db()->prepare(
        'SELECT 1 FROM customers WHERE LOWER(email) = ?
         UNION ALL SELECT 1 FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM customer_users WHERE LOWER(email) = ? AND id <> ?
         LIMIT 1'
    );
    $emailCheck->execute([$email, $email, $email, $sub2]);
    if ($emailCheck->fetch()) json_error('This email address is already used by another portal account.', 409);

    if ($newPassword !== '') {
        db()->prepare(
            'UPDATE customer_users
             SET name=?, email=?, phone=?, role=?, is_active=?, password=?
             WHERE id=? AND customer_id=?'
        )->execute([
            $name,
            $email,
            $phone !== '' ? $phone : null,
            $role,
            $isActive,
            password_hash($newPassword, PASSWORD_BCRYPT),
            $sub2,
            $customer['id'],
        ]);
    } else {
        db()->prepare(
            'UPDATE customer_users
             SET name=?, email=?, phone=?, role=?, is_active=?
             WHERE id=? AND customer_id=?'
        )->execute([
            $name,
            $email,
            $phone !== '' ? $phone : null,
            $role,
            $isActive,
            $sub2,
            $customer['id'],
        ]);
    }
    json_out(['ok' => true]);
}

if ($sub === 'users' && $sub2 && $method === 'DELETE') {
    require_customer_owner($customer);
    $stmt = db()->prepare('DELETE FROM customer_users WHERE id = ? AND customer_id = ?');
    $stmt->execute([$sub2, $customer['id']]);
    if ($stmt->rowCount() === 0) json_error('Assistant not found.', 404);
    json_out(null, 204);
}

// ---- Service requests -------------------------------------------------------
if ($sub === 'service-requests' && $method === 'GET') {
    $stmt = db()->prepare('SELECT sr.*, m.model AS machine_model FROM service_requests sr LEFT JOIN machines m ON m.id = sr.machine_id WHERE sr.customer_id = ? ORDER BY sr.created_at DESC');
    $stmt->execute([$customer['id']]);
    $requests = $stmt->fetchAll();
    foreach ($requests as &$request) {
        $request['machine'] = $request['machine_id']
            ? ['id' => $request['machine_id'], 'model' => $request['machine_model']]
            : null;
        unset($request['machine_model']);
    }
    json_out($requests);
}

if ($sub === 'service-requests' && $method === 'POST') {
    require_customer_write_access($customer);
    $b = body();
    $description = trim((string)($b['description'] ?? ''));
    $priority = strtoupper(trim((string)($b['priority'] ?? 'NORMAL')));
    if ($description === '') json_error('Describe the service required.');
    if (!in_array($priority, ['LOW', 'NORMAL', 'HIGH', 'URGENT'], true)) {
        json_error('Invalid service priority.');
    }
    $machineId = $b['machineId'] ?? null;
    if ($machineId) {
        $stmt = db()->prepare(
            'SELECT id FROM machines
             WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
        );
        $stmt->execute([$machineId, $customer['id']]);
        if (!$stmt->fetch()) json_error('Selected machine was not found.', 404);
    }
    $newId = uuid();
    db()->prepare("INSERT INTO service_requests (id, customer_id, machine_id, description, status, priority, created_at) VALUES (?,?,?,?,'OPEN',?,NOW())")
        ->execute([$newId, $customer['id'], $machineId, $description, $priority]);
    json_out(['id' => $newId], 201);
}

if ($sub === 'service-requests' && $sub2 && $sub3 === 'cancel' && $method === 'PUT') {
    require_customer_write_access($customer);
    $stmt = db()->prepare('SELECT * FROM service_requests WHERE id = ? AND customer_id = ?');
    $stmt->execute([$sub2, $customer['id']]);
    $req = $stmt->fetch();
    if (!$req) json_error('Not found', 404);
    if (!in_array($req['status'], ['OPEN', 'ASSIGNED'], true)) json_error('Only Open or Assigned requests can be cancelled.');
    db()->prepare("UPDATE service_requests SET status='CANCELLED' WHERE id=?")->execute([$sub2]);
    json_out(['ok' => true]);
}

// ---- Spare parts (read-only, no pricing) -----------------------------------
if ($sub === 'spare-parts' && $method === 'GET') {
    $stmt = db()->query('SELECT id, part_number, name, category, stock_qty FROM spare_parts WHERE deleted_at IS NULL');
    json_out($stmt->fetchAll());
}

// ---- Request spare parts ----------------------------------------------------
if ($sub === 'spare-part-requests' && $method === 'POST') {
    require_customer_write_access($customer);
    $b = body();
    $sparePartId = trim((string)($b['sparePartId'] ?? ''));
    $serviceRequestId = trim((string)($b['serviceRequestId'] ?? ''));
    $quantity = (float)($b['quantity'] ?? 0);
    if ($quantity <= 0 || floor($quantity) !== $quantity) {
        json_error('Spare-part quantity must be a whole number greater than zero.');
    }
    $stmt = db()->prepare('SELECT 1 FROM spare_parts WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$sparePartId]);
    if (!$stmt->fetch()) json_error('Spare part not found.', 404);
    if ($serviceRequestId !== '') {
        $stmt = db()->prepare('SELECT 1 FROM service_requests WHERE id = ? AND customer_id = ?');
        $stmt->execute([$serviceRequestId, $customer['id']]);
        if (!$stmt->fetch()) json_error('Service request not found for this customer.', 404);
    }
    $newId = uuid();
    db()->prepare("INSERT INTO spare_part_requests (id, spare_part_id, request_id, quantity, status, created_at) VALUES (?,?,?,?,'PENDING',NOW())")
        ->execute([
            $newId,
            $sparePartId,
            $serviceRequestId !== '' ? $serviceRequestId : null,
            (int)$quantity,
        ]);
    json_out(['id' => $newId], 201);
}

// ---- Download a checklist report (JSON for now — swap in a real PDF
// generator such as dompdf/mpdf if you want a byte-for-byte PDF file) -----
if ($sub === 'reports' && $sub2 && $sub3 === 'download' && $method === 'GET') {
    $stmt = db()->prepare('SELECT cr.*, m.customer_id FROM checklist_reports cr JOIN machines m ON m.id = cr.machine_id WHERE cr.id = ?');
    $stmt->execute([$sub2]);
    $report = $stmt->fetch();
    if (!$report || $report['customer_id'] !== $customer['id']) json_error('Not found', 404);
    $stmt2 = db()->prepare('SELECT * FROM checklist_answers WHERE report_id = ?');
    $stmt2->execute([$sub2]);
    $report['answers'] = $stmt2->fetchAll();
    json_out($report);
}

json_error('Unknown request', 404);
