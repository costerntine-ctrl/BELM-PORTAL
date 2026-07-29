<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$id = trim((string)($_GET['id'] ?? ''));

function technician_spare_request_machine(array $user, string $machineId): array {
    if (($user['roleName'] ?? '') !== 'Technician') {
        json_error('Only a BELM Technician can submit this spare-part request.', 403);
    }
    $assignedCustomerId = trim((string)($user['assignedCustomerId'] ?? ''));
    if ($assignedCustomerId === '') {
        json_error('This Technician has not been assigned to a customer.', 403);
    }

    $stmt = db()->prepare(
        'SELECT m.id, m.customer_id, m.machine_type, m.model, m.serial_number,
                m.reg_number, m.brand, c.name AS customer_name
         FROM machines m
         JOIN customers c ON c.id = m.customer_id
         WHERE m.id = ? AND m.customer_id = ?
           AND m.deleted_at IS NULL
           AND c.deleted_at IS NULL AND c.is_active = 1'
    );
    $stmt->execute([$machineId, $assignedCustomerId]);
    $machine = $stmt->fetch();
    if (!$machine) {
        json_error('The selected machine is not assigned to this Technician.', 403);
    }
    return $machine;
}

function validate_technician_spare_request(array $body): array {
    $machineId = trim((string)($body['machineId'] ?? ''));
    $partNumber = strtoupper(trim((string)($body['partNumber'] ?? '')));
    $description = trim((string)($body['description'] ?? ''));
    $machineType = trim((string)($body['machineType'] ?? ''));

    if ($machineId === '') json_error('Select the machine that requires this spare part.');
    if ($partNumber === '') json_error('Part number is required.');
    if (strlen($partNumber) > 100) json_error('Part number is too long.');
    if ($description === '') json_error('Spare-part description is required.');
    if (strlen($description) > 500) json_error('Description must be 500 characters or fewer.');
    if ($machineType === '') json_error('Machine type is required.');
    if (strlen($machineType) > 100) json_error('Machine type is too long.');

    return [
        'machineId' => $machineId,
        'partNumber' => $partNumber,
        'description' => $description,
        'machineType' => $machineType,
    ];
}

// Technician -> Spare Parts Inventory alert.
if ($method === 'POST') {
    $request = validate_technician_spare_request(body());
    $machine = technician_spare_request_machine($user, $request['machineId']);
    if (strcasecmp(trim((string)$machine['machine_type']), $request['machineType']) !== 0) {
        json_error('Machine type does not match the selected machine.');
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $partStmt = $pdo->prepare(
            'SELECT id, stock_qty, deleted_at
             FROM spare_parts
             WHERE UPPER(part_number) = UPPER(?)
             LIMIT 1'
        );
        $partStmt->execute([$request['partNumber']]);
        $part = $partStmt->fetch();
        if ($part && $part['deleted_at'] !== null) {
            json_error('This part number is archived. Ask Inventory to restore it first.', 409);
        }

        if (!$part) {
            $partId = uuid();
            $pdo->prepare(
                'INSERT INTO spare_parts
                 (id, part_number, name, category, stock_qty, reorder_threshold,
                  purchase_price, selling_price, created_at)
                 VALUES (?,?,?,?,0,1,0,0,NOW())
                 ON CONFLICT (part_number) DO NOTHING'
            )->execute([
                $partId,
                $request['partNumber'],
                $request['description'],
                $machine['machine_type'],
            ]);
            $partStmt->execute([$request['partNumber']]);
            $part = $partStmt->fetch();
        }
        if (!$part) {
            throw new RuntimeException('The spare-part inventory record could not be created.');
        }
        if ((int)$part['stock_qty'] > 0) {
            json_error(
                'This spare part already has ' . (int)$part['stock_qty'] .
                ' unit(s) in Inventory. Ask Inventory to issue the available stock.',
                409
            );
        }

        $duplicate = $pdo->prepare(
            "SELECT id FROM spare_part_requests
             WHERE spare_part_id = ? AND machine_id = ?
               AND status IN ('PENDING', 'PURCHASE_REQUIRED')
             LIMIT 1"
        );
        $duplicate->execute([$part['id'], $machine['id']]);
        if ($duplicate->fetch()) {
            json_error('An open request for this part and machine already exists.', 409);
        }

        $requestId = uuid();
        $pdo->prepare(
            "INSERT INTO spare_part_requests
             (id, spare_part_id, request_id, machine_id, requested_by_id,
              requested_by_name, description, machine_type, quantity, status, created_at)
             VALUES (?,?,NULL,?,?,?,?,?,1,'PENDING',NOW())"
        )->execute([
            $requestId,
            $part['id'],
            $machine['id'],
            $user['id'],
            trim((string)($user['name'] ?? 'Technician')),
            $request['description'],
            $machine['machine_type'],
        ]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    json_out([
        'id' => $requestId,
        'sparePartId' => $part['id'],
        'stockQty' => 0,
        'status' => 'PENDING',
        'message' => 'Spare request sent to Inventory. Stock is 0; addition or purchase is required.',
    ], 201);
}

// Inventory users see all open Technician alerts.
if ($method === 'GET') {
    if (($user['roleName'] ?? '') === 'Technician') {
        $assignedCustomerId = trim((string)($user['assignedCustomerId'] ?? ''));
        if ($assignedCustomerId === '') {
            json_error('This Technician has not been assigned to a customer.', 403);
        }
        $stmt = db()->prepare(
            "SELECT spr.id, spr.spare_part_id, spr.machine_id, spr.quantity,
                    spr.status, spr.requested_by_name, spr.description,
                    spr.machine_type, spr.created_at,
                    sp.part_number, sp.name AS part_name, sp.stock_qty,
                    m.model AS machine_model, m.brand AS machine_brand,
                    m.serial_number, m.reg_number,
                    c.name AS customer_name
             FROM spare_part_requests spr
             JOIN spare_parts sp ON sp.id = spr.spare_part_id
             JOIN machines m ON m.id = spr.machine_id
             JOIN customers c ON c.id = m.customer_id
             WHERE spr.requested_by_id = ?
               AND m.customer_id = ?
             ORDER BY spr.created_at DESC
             LIMIT 30"
        );
        $stmt->execute([$user['id'], $assignedCustomerId]);
        json_out($stmt->fetchAll());
    }

    require_page_access($user, 'spare-parts');
    $stmt = db()->query(
        "SELECT spr.id, spr.spare_part_id, spr.machine_id, spr.quantity,
                spr.status, spr.requested_by_name, spr.description,
                spr.machine_type, spr.created_at,
                sp.part_number, sp.name AS part_name, sp.stock_qty,
                sp.reorder_threshold,
                m.model AS machine_model, m.brand AS machine_brand,
                m.serial_number, m.reg_number,
                c.name AS customer_name
         FROM spare_part_requests spr
         JOIN spare_parts sp ON sp.id = spr.spare_part_id
         LEFT JOIN machines m ON m.id = spr.machine_id
         LEFT JOIN customers c ON c.id = m.customer_id
         WHERE spr.machine_id IS NOT NULL
           AND spr.status IN ('PENDING', 'PURCHASE_REQUIRED')
         ORDER BY
           CASE WHEN spr.status = 'PURCHASE_REQUIRED' THEN 0 ELSE 1 END,
           spr.created_at DESC"
    );
    json_out($stmt->fetchAll());
}

// Inventory marks the alert for purchasing or closes it after stock is added.
if ($method === 'PUT') {
    if ($id === '') json_error('Spare request ID is required.');
    $body = body();
    $action = strtolower(trim((string)($body['action'] ?? '')));

    if (($user['roleName'] ?? '') === 'Technician') {
        if ($action !== 'edit') {
            json_error('Technicians can only re-edit a pending Inventory Request.', 403);
        }
        $requestEdit = validate_technician_spare_request($body);
        $machine = technician_spare_request_machine($user, $requestEdit['machineId']);
        if (strcasecmp(trim((string)$machine['machine_type']), $requestEdit['machineType']) !== 0) {
            json_error('Machine type does not match the selected machine.');
        }

        $stmt = db()->prepare(
            "SELECT id, status
             FROM spare_part_requests
             WHERE id = ? AND requested_by_id = ?"
        );
        $stmt->execute([$id, $user['id']]);
        $existingRequest = $stmt->fetch();
        if (!$existingRequest) json_error('Inventory Request not found.', 404);
        if ($existingRequest['status'] !== 'PENDING') {
            json_error('This request cannot be edited because Inventory has already acted on it.', 409);
        }

        $partStmt = db()->prepare(
            'SELECT id, stock_qty, deleted_at
             FROM spare_parts
             WHERE UPPER(part_number) = UPPER(?)
             LIMIT 1'
        );
        $partStmt->execute([$requestEdit['partNumber']]);
        $part = $partStmt->fetch();
        if ($part && $part['deleted_at'] !== null) {
            json_error('This part number is archived. Ask Inventory to restore it first.', 409);
        }
        if (!$part) {
            $newPartId = uuid();
            db()->prepare(
                'INSERT INTO spare_parts
                 (id, part_number, name, category, stock_qty, reorder_threshold,
                  purchase_price, selling_price, created_at)
                 VALUES (?,?,?,?,0,1,0,0,NOW())
                 ON CONFLICT (part_number) DO NOTHING'
            )->execute([
                $newPartId,
                $requestEdit['partNumber'],
                $requestEdit['description'],
                $machine['machine_type'],
            ]);
            $partStmt->execute([$requestEdit['partNumber']]);
            $part = $partStmt->fetch();
        }
        if (!$part) json_error('The spare-part Inventory record could not be created.', 500);
        if ((int)$part['stock_qty'] > 0) {
            json_error(
                'This spare part already has ' . (int)$part['stock_qty'] .
                ' unit(s) in Inventory. Ask Inventory to issue the available stock.',
                409
            );
        }

        $duplicate = db()->prepare(
            "SELECT id FROM spare_part_requests
             WHERE spare_part_id = ? AND machine_id = ? AND id <> ?
               AND status IN ('PENDING', 'PURCHASE_REQUIRED')
             LIMIT 1"
        );
        $duplicate->execute([$part['id'], $machine['id'], $id]);
        if ($duplicate->fetch()) {
            json_error('Another open request for this part and machine already exists.', 409);
        }

        db()->prepare(
            "UPDATE spare_part_requests
             SET spare_part_id = ?, machine_id = ?, description = ?,
                 machine_type = ?, quantity = 1
             WHERE id = ? AND requested_by_id = ? AND status = 'PENDING'"
        )->execute([
            $part['id'],
            $machine['id'],
            $requestEdit['description'],
            $machine['machine_type'],
            $id,
            $user['id'],
        ]);
        json_out([
            'ok' => true,
            'id' => $id,
            'status' => 'PENDING',
            'message' => 'Inventory Request updated successfully.',
        ]);
    }

    require_page_access($user, 'spare-parts');
    $stmt = db()->prepare(
        'SELECT spr.id, spr.status, sp.stock_qty
         FROM spare_part_requests spr
         JOIN spare_parts sp ON sp.id = spr.spare_part_id
         WHERE spr.id = ?'
    );
    $stmt->execute([$id]);
    $request = $stmt->fetch();
    if (!$request) json_error('Spare request not found.', 404);

    if ($action === 'purchase') {
        db()->prepare(
            "UPDATE spare_part_requests
             SET status = 'PURCHASE_REQUIRED', resolved_at = NULL
             WHERE id = ?"
        )->execute([$id]);
        json_out(['ok' => true, 'status' => 'PURCHASE_REQUIRED']);
    }
    if ($action === 'resolve') {
        if ((int)$request['stock_qty'] <= 0) {
            json_error('Add stock quantity above 0 before closing this alert.', 409);
        }
        db()->prepare(
            "UPDATE spare_part_requests
             SET status = 'ADDED', resolved_at = NOW()
             WHERE id = ?"
        )->execute([$id]);
        json_out(['ok' => true, 'status' => 'ADDED']);
    }

    json_error('Select Purchase Required or add the part to Inventory.');
}

json_error('Unknown request', 404);
