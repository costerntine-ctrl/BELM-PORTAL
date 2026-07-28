<?php
require_once __DIR__ . '/../config/helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;
$action = $_GET['action'] ?? '';

function clean_required(array $body, string $key, string $label, int $maxLength = 255): string {
    $value = trim((string)($body[$key] ?? ''));
    if ($value === '') json_error("$label is required.");
    if (strlen($value) > $maxLength) json_error("$label is too long.");
    return $value;
}

function application_portal_url(): string {
    return portal_base_url();
}

/**
 * Use an existing active checklist for this machine type. If none exists,
 * create a practical default inspection checklist so technicians can start
 * work immediately after approval.
 */
function sync_checklist_for_machine_type(string $machineType): array {
    $stmt = db()->prepare(
        'SELECT id, machine_type
         FROM checklist_templates
         WHERE LOWER(machine_type) = LOWER(?) AND deleted_at IS NULL AND is_active = 1
         ORDER BY created_at ASC
         LIMIT 1'
    );
    $stmt->execute([$machineType]);
    $existing = $stmt->fetch();
    if ($existing) {
        return [
            'templateId' => $existing['id'],
            'machineType' => $existing['machine_type'],
            'created' => false,
        ];
    }

    $templateId = uuid();
    db()->prepare(
        'INSERT INTO checklist_templates
         (id, name, machine_type, is_active, created_at)
         VALUES (?,?,?,1,NOW())'
    )->execute([
        $templateId,
        "$machineType - Standard Inspection",
        $machineType,
    ]);

    $items = [
        ['Engine condition', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Hydraulic system', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Electrical system', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Transmission and drive system', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Tyres / tracks and wheels', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Brakes and steering', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Safety devices and warning alarms', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Oil, coolant or hydraulic leaks', 'DROPDOWN', ['None', 'Minor', 'Serious']],
        ['Technician remarks', 'TEXT', null],
    ];
    $safety = [
        'Good' => 'GREEN',
        'Attention' => 'YELLOW',
        'Critical' => 'RED',
        'None' => 'GREEN',
        'Minor' => 'YELLOW',
        'Serious' => 'RED',
    ];

    $insert = db()->prepare(
        'INSERT INTO checklist_template_items
         (id, template_id, label, input_type, safety_level, options, option_safety, "order", is_required)
         VALUES (?,?,?,?,?,CAST(? AS JSONB),CAST(? AS JSONB),?,?)'
    );
    foreach ($items as $order => [$label, $inputType, $options]) {
        $optionSafety = [];
        foreach (($options ?? []) as $option) {
            if (isset($safety[$option])) $optionSafety[$option] = $safety[$option];
        }
        $insert->execute([
            uuid(),
            $templateId,
            $label,
            $inputType,
            null,
            $options ? json_encode($options) : null,
            $optionSafety ? json_encode($optionSafety) : null,
            $order,
            $label === 'Technician remarks' ? 0 : 1,
        ]);
    }

    return [
        'templateId' => $templateId,
        'machineType' => $machineType,
        'created' => true,
    ];
}

// Public: submit a request from portal.belmgeneraltech.co.tz/apply.
if ($method === 'POST' && !$id) {
    $body = body();

    // Honeypot used by the public form. Humans never see or fill this field.
    if (trim((string)($body['website'] ?? '')) !== '') {
        json_out(['ok' => true, 'message' => 'Application received.'], 202);
    }

    $companyName = clean_required($body, 'companyName', 'Company name');
    $email = strtolower(clean_required($body, 'email', 'Email'));
    $address = clean_required($body, 'address', 'Company address', 500);
    $phone = clean_required($body, 'phone', 'Phone number', 50);
    $tinNumber = clean_required($body, 'tinNumber', 'TIN number', 50);
    $vrn = clean_required($body, 'vrn', 'VRN number', 50);
    $machineType = clean_required($body, 'machineType', 'Machine type', 100);
    $brand = clean_required($body, 'brand', 'Machine brand', 100);
    $model = clean_required($body, 'model', 'Machine model');
    $regNumber = clean_required($body, 'regNumber', 'Machine registration number', 100);
    $password = (string)($body['password'] ?? '');

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid email address.');
    if (strlen($password) < 8) json_error('Password must contain at least 8 characters.');

    $stmt = db()->prepare(
        "SELECT
           EXISTS(SELECT 1 FROM customers WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL)
           OR EXISTS(SELECT 1 FROM customer_users WHERE LOWER(email) = LOWER(?))
           OR EXISTS(SELECT 1 FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL)
           OR EXISTS(SELECT 1 FROM customer_applications WHERE LOWER(email) = LOWER(?) AND status = 'PENDING')"
    );
    $stmt->execute([$email, $email, $email, $email]);
    if ($stmt->fetchColumn()) {
        json_error('This email already has a portal account or pending application.', 409);
    }

    $applicationId = uuid();
    $reference = 'BELM-' . strtoupper(substr(str_replace('-', '', $applicationId), 0, 10));
    try {
        db()->prepare(
            'INSERT INTO customer_applications
             (id, reference_no, company_name, email, address, phone, tin_number, vrn,
              machine_type, brand, model, reg_number, password_hash, status, submitted_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,? ,?,NOW())'
        )->execute([
            $applicationId,
            $reference,
            $companyName,
            $email,
            $address,
            $phone,
            $tinNumber,
            $vrn,
            $machineType,
            $brand,
            $model,
            $regNumber,
            password_hash($password, PASSWORD_BCRYPT),
            'PENDING',
        ]);
    } catch (PDOException $error) {
        if ($error->getCode() === '23505') {
            json_error('This email already has a pending application.', 409);
        }
        throw $error;
    }

    json_out([
        'ok' => true,
        'reference' => $reference,
        'status' => 'PENDING',
        'message' => 'Application received. BELM administration will review it.',
    ], 201);
}

// Every operation below is admin-only.
$user = require_auth();
require_page_access($user, 'customers');

if ($method === 'GET' && !$id) {
    $status = strtoupper(trim((string)($_GET['status'] ?? '')));
    $sql = 'SELECT a.*, u.name AS reviewed_by_name,
                   c.portal_link, c.name AS registered_customer_name
            FROM customer_applications a
            LEFT JOIN users u ON u.id = a.reviewed_by
            LEFT JOIN customers c ON c.id = a.customer_id';
    $params = [];
    if (in_array($status, ['PENDING', 'APPROVED', 'CANCELLED'], true)) {
        $sql .= ' WHERE a.status = ?';
        $params[] = $status;
    }
    $sql .= " ORDER BY CASE a.status WHEN 'PENDING' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END,
                       a.submitted_at DESC";
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    json_out([
        'applications' => $stmt->fetchAll(),
        'portalUrl' => application_portal_url(),
    ]);
}

if ($method === 'PUT' && $id && $action === 'approve') {
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT * FROM customer_applications WHERE id = ? FOR UPDATE');
        $stmt->execute([$id]);
        $application = $stmt->fetch();
        if (!$application) {
            $pdo->rollBack();
            json_error('Application not found.', 404);
        }
        if ($application['status'] !== 'PENDING') {
            $pdo->rollBack();
            json_error('Only a pending application can be approved.', 409);
        }

        $stmt = $pdo->prepare('SELECT id FROM customers WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL');
        $stmt->execute([$application['email']]);
        if ($stmt->fetch()) {
            $pdo->rollBack();
            json_error('A customer with this email already exists.', 409);
        }

        $checklist = sync_checklist_for_machine_type($application['machine_type']);
        $customerId = uuid();
        $machineId = uuid();
        $portalLink = customer_portal_slug($application['company_name']);

        $pdo->prepare(
            'INSERT INTO customers
             (id, name, tin_number, vrn, email, phone, address, portal_link,
              password, is_active, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,1,NOW())'
        )->execute([
            $customerId,
            $application['company_name'],
            $application['tin_number'],
            $application['vrn'],
            $application['email'],
            $application['phone'],
            $application['address'],
            $portalLink,
            $application['password_hash'],
        ]);

        $pdo->prepare(
            'INSERT INTO machines
             (id, customer_id, machine_type, model, serial_number, reg_number,
              brand, status, created_at)
             VALUES (?,?,?,?,NULL,?,?,?,NOW())'
        )->execute([
            $machineId,
            $customerId,
            $checklist['machineType'],
            $application['model'],
            $application['reg_number'],
            $application['brand'],
            'UNKNOWN',
        ]);

        $pdo->prepare(
            "UPDATE customer_applications
             SET status = 'APPROVED', reviewed_at = NOW(), reviewed_by = ?,
                 customer_id = ?, machine_id = ?
             WHERE id = ?"
        )->execute([$user['id'], $customerId, $machineId, $id]);

        $pdo->prepare(
            'INSERT INTO activity_logs (id, user_id, action, entity, entity_id, metadata, created_at)
             VALUES (?,?,?,?,?,?,NOW())'
        )->execute([
            uuid(),
            $user['id'],
            'APPROVE_CUSTOMER_APPLICATION',
            'customerApplication',
            $id,
            json_encode(['customerId' => $customerId, 'machineId' => $machineId]),
        ]);

        $pdo->commit();
        json_out([
            'ok' => true,
            'status' => 'APPROVED',
            'customerId' => $customerId,
            'machineId' => $machineId,
            'customerName' => $application['company_name'],
            'loginEmail' => $application['email'],
            'portalLink' => $portalLink,
            'loginUrl' => customer_portal_url($portalLink),
            'checklistTemplateId' => $checklist['templateId'],
            'checklistCreated' => $checklist['created'],
            'message' => 'Customer, machine and checklist access are ready.',
        ]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

if ($method === 'PUT' && $id && $action === 'cancel') {
    $stmt = db()->prepare(
        "UPDATE customer_applications
         SET status = 'CANCELLED', reviewed_at = NOW(), reviewed_by = ?
         WHERE id = ? AND status = 'PENDING'"
    );
    $stmt->execute([$user['id'], $id]);
    if ($stmt->rowCount() === 0) {
        json_error('Application was not found or is no longer pending.', 409);
    }
    db()->prepare(
        'INSERT INTO activity_logs (id, user_id, action, entity, entity_id, created_at)
         VALUES (?,?,?,?,?,NOW())'
    )->execute([uuid(), $user['id'], 'CANCEL_CUSTOMER_APPLICATION', 'customerApplication', $id]);
    json_out(['ok' => true, 'status' => 'CANCELLED']);
}

json_error('Unknown application request.', 404);
