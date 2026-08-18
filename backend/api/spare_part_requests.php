<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/mailer.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$id = trim((string)($_GET['id'] ?? ''));

function technician_customer_is_self_service(array $user): bool {
    if (($user['roleName'] ?? '') !== 'Technician') return false;
    $customerId = trim((string)($user['assignedCustomerId'] ?? ''));
    $userId = trim((string)($user['id'] ?? ''));
    if ($customerId === '' || $userId === '') return false;
    $stmt = db()->prepare(
        'SELECT c.is_machinery_admin, u.is_customer_managed
         FROM users u JOIN customers c ON c.id = u.assigned_customer_id
         WHERE u.id = ? AND c.id = ? AND u.deleted_at IS NULL AND c.deleted_at IS NULL'
    );
    $stmt->execute([$userId, $customerId]);
    $row = $stmt->fetch();
    return $row && !empty($row['is_machinery_admin']) && !empty($row['is_customer_managed']);
}

function require_technician_belm_inventory_mode(array $user): void {
    if (technician_customer_is_self_service($user)) {
        json_error('This customer is in Self-Service Mode. BELM Inventory is private. Use Recommend Spare for the customer, then the customer can explicitly request BELM support.', 403);
    }
}

function technician_spare_request_machine(array $user, string $machineId): array {
    if (($user['roleName'] ?? '') !== 'Technician') {
        json_error('Only a BELM Technician can submit this spare-part request.', 403);
    }
    require_technician_belm_inventory_mode($user);
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

// V298 - when a BELM supply request originated from Customer Procurement,
// closing the BELM request also advances the customer's Procurement and
// Maintenance Process records. This keeps both organizations on one status.
function sync_customer_procurement_from_belm(string $procurementRequestId, string $actorName): void {
    if ($procurementRequestId === '') return;
    $pdo = db();
    $stmt = $pdo->prepare(
        "SELECT cpr.id,cpr.customer_id,cpr.machine_id,cpr.workflow_case_id,cpr.description,cpr.part_number,
                c.name AS customer_name,m.brand,m.model
         FROM customer_procurement_requests cpr
         JOIN customers c ON c.id=cpr.customer_id
         JOIN machines m ON m.id=cpr.machine_id
         WHERE cpr.id=?"
    );
    $stmt->execute([$procurementRequestId]);
    $req = $stmt->fetch();
    if (!$req) return;

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "UPDATE customer_procurement_requests
             SET status='PARTS_READY',handled_by_name=?,handled_at=NOW(),decision_note='BELM supply fulfilled / parts ready',updated_at=NOW()
             WHERE id=?"
        )->execute([$actorName,$procurementRequestId]);
        $pdo->prepare(
            "UPDATE breakdown_spare_requests
             SET status='PARTS_READY',fulfilled_by_name=?,fulfilled_at=NOW(),approval_note='BELM supply fulfilled / parts ready',updated_at=NOW()
             WHERE procurement_request_id=?"
        )->execute([$actorName,$procurementRequestId]);
        $caseId = trim((string)($req['workflow_case_id'] ?? ''));
        if ($caseId !== '') {
            $countStmt = $pdo->prepare(
                "SELECT COUNT(*) FILTER (WHERE status NOT IN ('PARTS_READY','REJECTED')) AS pending_count,
                        COUNT(*) FILTER (WHERE status='BELM_REQUESTED') AS belm_count,
                        COUNT(*) FILTER (WHERE status='PARTS_READY') AS ready_count
                 FROM breakdown_spare_requests
                 WHERE case_id=? AND procurement_request_id IS NOT NULL"
            );
            $countStmt->execute([$caseId]);
            $counts = $countStmt->fetch() ?: [];
            $pending = (int)($counts['pending_count'] ?? 0);
            $belm = (int)($counts['belm_count'] ?? 0);
            $ready = (int)($counts['ready_count'] ?? 0);
            if ($pending > 0) {
                $stage='PROCUREMENT'; $department='Procurement';
                $blocker=$belm>0 ? 'Waiting BELM supply via Procurement on ' . $belm . ' spare item(s).' : 'Waiting Procurement action on ' . $pending . ' spare item(s).';
            } elseif ($ready > 0) {
                $stage='PARTS_READY'; $department='Workshop'; $blocker=null;
            } else {
                $stage='DIAGNOSIS'; $department='Workshop'; $blocker='Procurement request closed without parts issued.';
            }
            $pdo->prepare(
                'UPDATE breakdown_cases SET current_stage=?,current_department=?,blocker_reason=?,stage_started_at=NOW(),updated_at=NOW() WHERE id=? AND status<>\'COMPLETED\''
            )->execute([$stage,$department,$blocker,$caseId]);
            $pdo->prepare(
                "INSERT INTO breakdown_case_events
                 (id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at)
                 VALUES (?,?,?,?,?,'BELM fulfilled the Procurement shortage request.','belm',NULL,?,NOW())"
            )->execute([uuid(),$caseId,$stage,$department,'BELM supply fulfilled',$actorName]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    try {
        customer_send_team_alert(
            (string)$req['customer_id'], ['machine-expenses','workflow'],
            'BELM SPARE SUPPLY READY - ' . trim(($req['brand'] ?? '') . ' ' . ($req['model'] ?? '')),
            'BELM marked the requested spare as fulfilled/ready: ' . ($req['part_number'] ?: $req['description']) . '. Maintenance Process has been updated.',
            true
        );
    } catch (Throwable $ignored) {}
    try {
        belm_log_customer_communication(
            (string)$req['customer_id'], (string)$req['machine_id'], 'BELM_TO_CUSTOMER', 'PORTAL',
            'BELM Spare Supply Ready',
            'BELM marked the Procurement shortage item as supplied/ready: ' . ($req['part_number'] ?: $req['description']) . '.',
            'PROCUREMENT', $procurementRequestId, $actorName, 'SENT'
        );
    } catch (Throwable $ignored) {}
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

    // V324: persist first, then explicitly alert the BELM Inventory owners.
    // Email is best-effort; the saved Inventory Request remains the source of
    // truth and the response tells the Technician whether alert delivery worked.
    $technicianName = trim((string)($user['name'] ?? 'Technician'));
    $machineLabel = trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? ''))
        ?: ((string)($machine['machine_type'] ?? '') ?: 'Machine');
    $inventoryText = 'Technician ' . $technicianName . ' submitted an Inventory Request.'
        . "\nCustomer: " . ($machine['customer_name'] ?? 'Unknown')
        . "\nMachine: " . $machineLabel
        . (!empty($machine['serial_number']) ? "\nSerial: " . $machine['serial_number'] : '')
        . "\nPart number: " . $request['partNumber']
        . "\nDescription: " . $request['description']
        . "\nRequest ID: " . $requestId;
    $belmDelivery = ['sent' => 0, 'failed' => 0, 'recipients' => []];
    try {
        $belmDelivery = belm_send_staff_page_alert(
            ['spare-parts'],
            'TECHNICIAN INVENTORY REQUEST - ' . $request['partNumber'] . ' - ' . $machineLabel,
            $inventoryText
        );
    } catch (Throwable $ignored) {}
    log_activity($user, 'created', 'sparePartRequest', $requestId, [
        'partNumber' => $request['partNumber'],
        'machineId' => $machine['id'],
        'customerId' => $machine['customer_id'],
    ]);

    json_out([
        'id' => $requestId,
        'sparePartId' => $part['id'],
        'stockQty' => 0,
        'status' => 'PENDING',
        'message' => 'Inventory Request saved and synchronized to BELM Spare Parts.',
        'delivery' => [
            'belm' => [
                'workflowSynced' => true,
                'emailsSent' => (int)($belmDelivery['sent'] ?? 0),
                'emailFailures' => (int)($belmDelivery['failed'] ?? 0),
            ],
        ],
    ], 201);
}

// Inventory users see all open Technician alerts.
if ($method === 'GET') {
    if (($user['roleName'] ?? '') === 'Technician') {
        require_technician_belm_inventory_mode($user);
        $assignedCustomerId = trim((string)($user['assignedCustomerId'] ?? ''));
        if ($assignedCustomerId === '') {
            json_error('This Technician has not been assigned to a customer.', 403);
        }
        $stmt = db()->prepare(
            "SELECT spr.id, spr.spare_part_id, spr.reference_number, spr.procurement_request_id, spr.machine_id, spr.quantity,
                    spr.status, spr.requested_by_name, spr.description,
                    spr.machine_type, spr.created_at,
                    sp.part_number, sp.name AS part_name, sp.stock_qty,
                    m.model AS machine_model, m.brand AS machine_brand,
                    m.serial_number, m.reg_number,
                    c.name AS customer_name
             FROM spare_part_requests spr
             LEFT JOIN spare_parts sp ON sp.id = spr.spare_part_id
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
        "SELECT spr.id, spr.spare_part_id, spr.reference_number, spr.procurement_request_id, spr.machine_id, spr.quantity,
                spr.status, spr.requested_by_id, spr.requested_by_name, spr.description,
                spr.machine_type, spr.created_at,
                sp.part_number, sp.name AS part_name, sp.stock_qty,
                sp.reorder_threshold, sp.selling_price,
                m.model AS machine_model, m.brand AS machine_brand,
                m.serial_number, m.reg_number,
                c.id AS customer_id, c.name AS customer_name
         FROM spare_part_requests spr
         LEFT JOIN spare_parts sp ON sp.id = spr.spare_part_id
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
        'SELECT spr.id, spr.status, spr.spare_part_id, spr.procurement_request_id, spr.machine_id, m.customer_id,
                spr.description, spr.quantity, sp.stock_qty
         FROM spare_part_requests spr
         LEFT JOIN spare_parts sp ON sp.id = spr.spare_part_id
         LEFT JOIN machines m ON m.id = spr.machine_id
         WHERE spr.id = ?'
    );
    $stmt->execute([$id]);
    $request = $stmt->fetch();
    if (!$request) json_error('Spare request not found.', 404);

    if ($action === 'select-spare') {
        $sparePartId = trim((string)($body['sparePartId'] ?? ''));
        if ($sparePartId === '') json_error('Choose a BELM spare part.');
        $partStmt = db()->prepare(
            'SELECT id, part_number, name, stock_qty, selling_price FROM spare_parts
             WHERE id = ? AND deleted_at IS NULL'
        );
        $partStmt->execute([$sparePartId]);
        $part = $partStmt->fetch();
        if (!$part) json_error('Selected BELM spare part was not found.', 404);

        db()->prepare(
            "UPDATE spare_part_requests
             SET spare_part_id = ?, status = 'PENDING', resolved_at = NULL
             WHERE id = ?"
        )->execute([$sparePartId, $id]);

        // Once Spare Parts has identified the exact item, Accounts gets a
        // second targeted alert with the selected part/price so the Proforma
        // can be prepared without guessing.
        try {
            $detailStmt = db()->prepare(
                'SELECT spr.quantity, spr.description, spr.machine_id, m.customer_id, c.name AS customer_name,
                        m.model AS machine_model, m.brand AS machine_brand
                 FROM spare_part_requests spr
                 LEFT JOIN machines m ON m.id = spr.machine_id
                 LEFT JOIN customers c ON c.id = m.customer_id
                 WHERE spr.id = ?'
            );
            $detailStmt->execute([$id]);
            $detail = $detailStmt->fetch() ?: [];
            belm_send_staff_page_alert(
                ['billing'],
                'Spare Selected — Proforma Ready to Prepare',
                "BELM Spare Parts selected the internal spare for a customer request.\n\n"
                . "Customer: " . ($detail['customer_name'] ?? 'Unknown') . "\n"
                . "Machine: " . trim(($detail['machine_brand'] ?? '') . ' ' . ($detail['machine_model'] ?? '')) . "\n"
                . "Customer requested: " . ($detail['description'] ?? '') . "\n"
                . "BELM selected: " . $part['part_number'] . " — " . $part['name'] . "\n"
                . "Quantity: " . (int)($detail['quantity'] ?? 1) . "\n"
                . "Current selling price: TZS " . number_format((float)$part['selling_price'], 2) . "\n"
                . "Request ID: $id\n\nOpen Billing and prepare/review the Proforma."
            );
            if (!empty($detail['customer_id'])) {
                belm_log_customer_communication(
                    (string)$detail['customer_id'],
                    !empty($detail['machine_id']) ? (string)$detail['machine_id'] : null,
                    'BELM_TO_CUSTOMER', 'PORTAL', 'Spare Identified',
                    'BELM identified the requested spare as ' . $part['part_number'] . ' — ' . $part['name'] . '. Accounts is preparing the Proforma.',
                    'SPARE_REQUEST', $id, (string)($user['name'] ?? 'BELM Spare Parts'), 'SENT'
                );
            }
        } catch (Throwable $error) { /* best-effort only */ }

        json_out([
            'ok' => true,
            'status' => 'PENDING',
            'sparePartId' => $sparePartId,
            'message' => 'BELM spare selected. Accounts has been alerted to prepare the Proforma.',
        ]);
    }

    if ($action === 'purchase') {
        db()->prepare(
            "UPDATE spare_part_requests
             SET status = 'PURCHASE_REQUIRED', resolved_at = NULL
             WHERE id = ?"
        )->execute([$id]);
        if (!empty($request['customer_id'])) {
            belm_log_customer_communication(
                (string)$request['customer_id'], $request['machine_id'] ?: null,
                'BELM_TO_CUSTOMER', 'PORTAL', 'Spare Purchase Required',
                'BELM marked the requested spare for sourcing/purchase.',
                'SPARE_REQUEST', $id, (string)($user['name'] ?? 'BELM Spare Parts'), 'SENT'
            );
        }
        json_out(['ok' => true, 'status' => 'PURCHASE_REQUIRED']);
    }
    if ($action === 'resolve') {
        // Inventory-linked requests must actually have stock before closing.
        // Custom (non-inventory) requests have nothing to check — BELM has
        // simply sourced/delivered the part, so just mark it fulfilled.
        if ($request['spare_part_id'] !== null && (int)$request['stock_qty'] < (int)$request['quantity']) {
            json_error('BELM stock is not enough to fulfill this request. Required: ' . (int)$request['quantity'] . ', available: ' . (int)$request['stock_qty'] . '.', 409);
        }
        db()->prepare(
            "UPDATE spare_part_requests
             SET status = 'ADDED', resolved_at = NOW()
             WHERE id = ?"
        )->execute([$id]);
        if (!empty($request['procurement_request_id'])) {
            sync_customer_procurement_from_belm((string)$request['procurement_request_id'], (string)($user['name'] ?? 'BELM Spare Parts'));
        }
        if (!empty($request['customer_id'])) {
            belm_log_customer_communication(
                (string)$request['customer_id'], $request['machine_id'] ?: null,
                'BELM_TO_CUSTOMER', 'PORTAL', 'Spare Request Fulfilled',
                'BELM marked the requested spare as sourced/fulfilled.',
                'SPARE_REQUEST', $id, (string)($user['name'] ?? 'BELM Spare Parts'), 'SENT'
            );
        }
        json_out(['ok' => true, 'status' => 'ADDED']);
    }

    json_error('Select Purchase Required or add the part to Inventory.');
}

json_error('Unknown request', 404);
