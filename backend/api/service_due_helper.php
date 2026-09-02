<?php
// Preventive-maintenance preparation for 250/500/1000/2000-hour milestones.
// This helper deliberately PREPARES only: it never decrements inventory and
// never sends a Draft PI to the customer without a BELM review/send action.

function belm_service_interval_for_due_hour(int $dueHour): int {
    if ($dueHour > 0 && $dueHour % 2000 === 0) return 2000;
    if ($dueHour > 0 && $dueHour % 1000 === 0) return 1000;
    if ($dueHour > 0 && $dueHour % 500 === 0) return 500;
    return 250;
}

function belm_service_type_for_interval(int $interval): string {
    return $interval . 'hrs';
}

function belm_service_label_for_interval(int $interval): string {
    return $interval . '-Hour Service';
}

function belm_next_due_hour_from_last_service(float $lastServiceHours, float $currentHours = 0, ?float $scheduleBaselineHours = null): int {
    if ($lastServiceHours > 0) {
        $base = max(0, (int)floor($lastServiceHours / 250) * 250);
        return max(250, $base + 250);
    }
    if ($scheduleBaselineHours !== null) {
        return max(250, (int)floor(max(0, $scheduleBaselineHours) / 250) * 250 + 250);
    }
    // Fallback for pre-V200 rows before their first new checklist submission.
    if ($currentHours > 0) {
        $due = (int)(ceil($currentHours / 250) * 250);
        return max(250, $due);
    }
    return 250;
}

function belm_inventory_match_for_service_part(?string $sparePartId, string $partNumber): ?array {
    if ($sparePartId) {
        $stmt = db()->prepare(
            'SELECT id, part_number, reference_number, name, stock_qty, selling_price
             FROM spare_parts WHERE id = ? AND deleted_at IS NULL'
        );
        $stmt->execute([$sparePartId]);
        $row = $stmt->fetch();
        if ($row) return $row;
    }
    $partNumber = trim($partNumber);
    if ($partNumber === '') return null;
    $stmt = db()->prepare(
        'SELECT id, part_number, reference_number, name, stock_qty, selling_price
         FROM spare_parts
         WHERE deleted_at IS NULL
           AND (LOWER(part_number) = LOWER(?) OR LOWER(COALESCE(reference_number, \'\')) = LOWER(?))
         ORDER BY CASE WHEN LOWER(part_number) = LOWER(?) THEN 0 ELSE 1 END
         LIMIT 1'
    );
    $stmt->execute([$partNumber, $partNumber, $partNumber]);
    return $stmt->fetch() ?: null;
}

function belm_template_service_parts(string $machineType, int $interval): array {
    $stmt = db()->prepare(
        'SELECT id, service_type FROM checklist_templates
         WHERE deleted_at IS NULL AND is_active = 1 AND LOWER(machine_type) = LOWER(?)
         ORDER BY created_at DESC'
    );
    $stmt->execute([$machineType]);
    $templateId = null;
    $needle = strtolower((string)$interval);
    foreach ($stmt->fetchAll() as $template) {
        $normalized = strtolower(preg_replace('/[^0-9a-z]+/i', '', (string)$template['service_type']));
        if (str_starts_with($normalized, $needle)) {
            $templateId = $template['id'];
            break;
        }
    }
    if (!$templateId) return [];
    $parts = db()->prepare(
        'SELECT spare_name, part_number, quantity
         FROM checklist_template_parts WHERE template_id = ? ORDER BY "order" ASC'
    );
    $parts->execute([$templateId]);
    return array_map(static fn(array $row): array => [
        'sparePartId' => null,
        'spareName' => $row['spare_name'],
        'partNumber' => $row['part_number'],
        'quantity' => (float)$row['quantity'],
        'unit' => 'PC',
        'source' => 'TEMPLATE',
    ], $parts->fetchAll());
}

function belm_machine_service_parts(string $machineId, string $machineType, int $interval): array {
    $stmt = db()->prepare(
        'SELECT spare_part_id, spare_name, part_number, quantity, unit
         FROM machine_service_parts
         WHERE machine_id = ? AND service_interval_hours = ?
         ORDER BY spare_name ASC, part_number ASC'
    );
    $stmt->execute([$machineId, $interval]);
    $rows = $stmt->fetchAll();
    if ($rows) {
        return array_map(static fn(array $row): array => [
            'sparePartId' => $row['spare_part_id'],
            'spareName' => $row['spare_name'],
            'partNumber' => $row['part_number'],
            'quantity' => (float)$row['quantity'],
            'unit' => $row['unit'] ?: 'PC',
            'source' => 'MACHINE',
        ], $rows);
    }
    return belm_template_service_parts($machineType, $interval);
}

function belm_seed_machine_service_parts_from_templates(string $machineId, string $machineType): int {
    $inserted = 0;
    foreach ([250, 500, 1000, 2000] as $interval) {
        $exists = db()->prepare('SELECT 1 FROM machine_service_parts WHERE machine_id = ? AND service_interval_hours = ? LIMIT 1');
        $exists->execute([$machineId, $interval]);
        if ($exists->fetch()) continue;
        foreach (belm_template_service_parts($machineType, $interval) as $part) {
            $inventory = belm_inventory_match_for_service_part(null, (string)$part['partNumber']);
            db()->prepare(
                'INSERT INTO machine_service_parts
                 (id, machine_id, service_interval_hours, spare_part_id, spare_name, part_number, quantity, unit, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())
                 ON CONFLICT (machine_id, service_interval_hours, part_number) DO NOTHING'
            )->execute([
                uuid(), $machineId, $interval, $inventory['id'] ?? null,
                $part['spareName'], strtoupper(trim((string)$part['partNumber'])),
                $part['quantity'], $part['unit'] ?: 'PC',
            ]);
            $inserted++;
        }
    }
    return $inserted;
}

function belm_create_service_draft_proforma(array $machine, string $alertId, int $interval, array $preparedItems): ?array {
    if (!$preparedItems) return null;
    $invoiceNo = belm_next_commercial_number('PI');
    $proformaId = uuid();
    $notice = 'AUTO-PREPARED FOR BELM REVIEW - ' . belm_service_label_for_interval($interval)
        . ' for ' . trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? ''))
        . '. Verify stock, quantities and prices before sending to the customer.';

    $pdo = db();
    $pdo->prepare(
        "INSERT INTO proforma_invoices
         (id, customer_id, invoice_no, date, vat_mode, vat_rate, discount, discount_type,
          notice, machine_id, source_service_due_alert_id, auto_prepared, delivery_status, created_at)
         VALUES (?,?,?,CURRENT_DATE,'VAT',18,0,'FIXED',?,?,?,1,'DRAFT',NOW())"
    )->execute([
        $proformaId, $machine['customer_id'], $invoiceNo, $notice,
        $machine['id'], $alertId,
    ]);

    $itemStmt = $pdo->prepare(
        'INSERT INTO proforma_invoice_items
         (id, proforma_id, section, part_number, description, qty, unit, unit_price, "order")
         VALUES (?,?,?,?,?,?,?,?,?)'
    );
    foreach ($preparedItems as $order => $item) {
        $itemStmt->execute([
            uuid(), $proformaId, belm_service_label_for_interval($interval),
            $item['partNumber'], $item['description'], $item['quantity'],
            $item['unit'], $item['unitPrice'], $order,
        ]);
    }
    return ['id' => $proformaId, 'invoiceNo' => $invoiceNo];
}


function belm_notify_service_due_alert(array $machine, array $alert): array {
    $draftNo = null;
    if (!empty($alert['draft_proforma_id'])) {
        $pi = db()->prepare('SELECT invoice_no FROM proforma_invoices WHERE id = ? AND deleted_at IS NULL');
        $pi->execute([$alert['draft_proforma_id']]);
        $draftNo = $pi->fetchColumn() ?: null;
    }
    $countStmt = db()->prepare('SELECT COUNT(*) FROM service_due_alert_items WHERE service_alert_id = ?');
    $countStmt->execute([$alert['id']]);
    $partsCount = (int)$countStmt->fetchColumn();
    $currentHours = (float)$alert['current_hours'];
    $dueHour = (int)$alert['due_hour'];
    $interval = (int)$alert['service_interval_hours'];
    $hoursRemaining = $dueHour - $currentHours;
    $machineLabel = trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? ''));
    $subject = 'SERVICE ALERT - ' . $dueHour . 'HRS - ' . ($machineLabel ?: $machine['machine_type']);
    $lines = [
        'Preventive service is due for BELM review.',
        '',
        'Customer: ' . ($machine['customer_name'] ?? 'Customer'),
        'Machine Type: ' . ($machine['machine_type'] ?? 'Not recorded'),
        'Brand: ' . (($machine['brand'] ?? '') ?: 'Not recorded'),
        'Model: ' . ($machine['model'] ?? 'Not recorded'),
        'Serial: ' . (($machine['serial_number'] ?? '') ?: 'Not recorded'),
        'Current Hours: ' . rtrim(rtrim(number_format($currentHours, 2, '.', ''), '0'), '.'),
        'Service Due: ' . $dueHour . ' hrs (' . belm_service_label_for_interval($interval) . ')',
        'Hours Remaining: ' . rtrim(rtrim(number_format($hoursRemaining, 2, '.', ''), '0'), '.'),
        'Inventory Check: ' . ($alert['inventory_status'] ?? 'NOT_CHECKED'),
        'Required Service Parts: ' . $partsCount,
        'Draft PI: ' . ($draftNo ?: 'Not prepared - service parts are not configured'),
        '',
        'REVIEW REQUIRED: verify service kit, stock availability, quantities and selling prices before sending the PI to the customer.',
    ];
    return belm_send_staff_page_alert(['customers', 'spare-parts', 'billing'], $subject, implode("\n", $lines));
}

function belm_prepare_service_due_alert(string $machineId, float $currentHours, bool $sendNotification = true): ?array {
    $stmt = db()->prepare(
        'SELECT m.id, m.customer_id, m.machine_type, m.model, m.brand, m.serial_number,
                m.reg_number, m.last_service_hours, m.service_schedule_baseline_hours, c.name AS customer_name, c.is_machinery_admin
         FROM machines m JOIN customers c ON c.id = m.customer_id
         WHERE m.id = ? AND m.deleted_at IS NULL AND c.deleted_at IS NULL AND c.is_active = 1'
    );
    $stmt->execute([$machineId]);
    $machine = $stmt->fetch();
    if (!$machine) return null;

    // Service Provider OFF means the customer is running its own maintenance
    // team. Their local reminder still works, but BELM must not auto-prepare a
    // commercial PI unless BELM is the active service provider.
    if (!empty($machine['is_machinery_admin'])) return null;

    $lastServiceHours = (float)($machine['last_service_hours'] ?? 0);
    $baseline = $machine['service_schedule_baseline_hours'] !== null ? (float)$machine['service_schedule_baseline_hours'] : null;
    $dueHour = belm_next_due_hour_from_last_service($lastServiceHours, $currentHours, $baseline);
    $hoursRemaining = $dueHour - $currentHours;
    if ($hoursRemaining > 60) return null;

    $existingStmt = db()->prepare('SELECT * FROM service_due_alerts WHERE machine_id = ? AND due_hour = ? LIMIT 1');
    $existingStmt->execute([$machineId, $dueHour]);
    $existing = $existingStmt->fetch();
    if ($existing) {
        if ((float)$existing['current_hours'] !== $currentHours) {
            db()->prepare('UPDATE service_due_alerts SET current_hours = ?, updated_at = NOW() WHERE id = ?')
                ->execute([$currentHours, $existing['id']]);
            $existing['current_hours'] = $currentHours;
        }
        // Retry email on a later checklist/dashboard scan if SMTP failed the
        // first time. The alert/PI themselves are deduplicated by due hour.
        if ($sendNotification && empty($existing['notified_at'])) {
            $notify = belm_notify_service_due_alert($machine, $existing);
            if ((int)($notify['sent'] ?? 0) > 0) {
                db()->prepare('UPDATE service_due_alerts SET notified_at = NOW(), updated_at = NOW() WHERE id = ?')
                    ->execute([$existing['id']]);
                $existing['notified_at'] = date('c');
            }
        }
        return $existing;
    }

    $interval = belm_service_interval_for_due_hour($dueHour);
    $serviceType = belm_service_type_for_interval($interval);
    $requiredParts = belm_machine_service_parts($machineId, (string)$machine['machine_type'], $interval);
    $alertId = uuid();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO service_due_alerts
             (id, machine_id, customer_id, due_hour, service_interval_hours, service_type, current_hours, status, inventory_status, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,\'REVIEW\',\'NOT_CHECKED\',NOW(),NOW())'
        )->execute([
            $alertId, $machineId, $machine['customer_id'], $dueHour,
            $interval, $serviceType, $currentHours,
        ]);

        $preparedItems = [];
        $availabilityCounts = ['READY' => 0, 'LOW_STOCK' => 0, 'OUT_OF_STOCK' => 0, 'NOT_IN_INVENTORY' => 0];
        $itemStmt = $pdo->prepare(
            'INSERT INTO service_due_alert_items
             (id, service_alert_id, spare_part_id, part_number, description, quantity_required, unit,
              stock_qty_snapshot, selling_price_snapshot, availability, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,NOW())'
        );
        foreach ($requiredParts as $part) {
            $inventory = belm_inventory_match_for_service_part($part['sparePartId'] ?? null, (string)$part['partNumber']);
            $qty = max(0.01, (float)$part['quantity']);
            $stock = $inventory ? (float)$inventory['stock_qty'] : 0.0;
            if (!$inventory) $availability = 'NOT_IN_INVENTORY';
            elseif ($stock <= 0) $availability = 'OUT_OF_STOCK';
            elseif ($stock < $qty) $availability = 'LOW_STOCK';
            else $availability = 'READY';
            $availabilityCounts[$availability]++;
            $description = trim((string)($part['spareName'] ?: ($inventory['name'] ?? 'Service spare')));
            $partNumber = strtoupper(trim((string)($part['partNumber'] ?: ($inventory['part_number'] ?? ''))));
            $unitPrice = $inventory ? (float)$inventory['selling_price'] : 0.0;
            $itemStmt->execute([
                uuid(), $alertId, $inventory['id'] ?? null, $partNumber, $description,
                $qty, $part['unit'] ?: 'PC', $stock, $unitPrice, $availability,
            ]);
            $preparedItems[] = [
                'partNumber' => $partNumber,
                'description' => $description,
                'quantity' => $qty,
                'unit' => $part['unit'] ?: 'PC',
                'unitPrice' => $unitPrice,
            ];
        }

        $inventoryStatus = 'NO_SERVICE_PARTS';
        if ($requiredParts) {
            if ($availabilityCounts['NOT_IN_INVENTORY'] > 0) $inventoryStatus = 'PART_NOT_MAPPED';
            elseif ($availabilityCounts['OUT_OF_STOCK'] > 0) $inventoryStatus = 'OUT_OF_STOCK';
            elseif ($availabilityCounts['LOW_STOCK'] > 0) $inventoryStatus = 'LOW_STOCK';
            else $inventoryStatus = 'READY';
        }

        $draft = belm_create_service_draft_proforma($machine, $alertId, $interval, $preparedItems);
        $pdo->prepare(
            'UPDATE service_due_alerts SET inventory_status = ?, draft_proforma_id = ?, updated_at = NOW() WHERE id = ?'
        )->execute([$inventoryStatus, $draft['id'] ?? null, $alertId]);
        $pdo->commit();

        if ($sendNotification) {
            $alertForNotify = [
                'id' => $alertId,
                'due_hour' => $dueHour,
                'service_interval_hours' => $interval,
                'current_hours' => $currentHours,
                'inventory_status' => $inventoryStatus,
                'draft_proforma_id' => $draft['id'] ?? null,
            ];
            $notify = belm_notify_service_due_alert($machine, $alertForNotify);
            if ((int)($notify['sent'] ?? 0) > 0) {
                db()->prepare('UPDATE service_due_alerts SET notified_at = NOW(), updated_at = NOW() WHERE id = ?')->execute([$alertId]);
            }
        }

        return [
            'id' => $alertId,
            'dueHour' => $dueHour,
            'serviceIntervalHours' => $interval,
            'inventoryStatus' => $inventoryStatus,
            'draftProformaId' => $draft['id'] ?? null,
            'draftProformaNo' => $draft['invoiceNo'] ?? null,
        ];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function belm_complete_due_service_alerts(string $machineId, float $serviceHours): void {
    db()->prepare(
        "UPDATE service_due_alerts
         SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW()
         WHERE machine_id = ? AND due_hour <= ? AND status <> 'COMPLETED'"
    )->execute([$machineId, $serviceHours]);
}

function belm_scan_service_due_alerts(): void {
    $stmt = db()->query(
        'SELECT m.id, m.customer_id, m.machine_type, m.brand, m.model, m.serial_number, m.reg_number,
                c.is_machinery_admin,
                COALESCE((SELECT cr.hour_meter_reading FROM checklist_reports cr WHERE cr.machine_id = m.id ORDER BY cr.created_at DESC LIMIT 1), 0) AS current_hours
         FROM machines m JOIN customers c ON c.id = m.customer_id
         WHERE m.deleted_at IS NULL AND c.deleted_at IS NULL AND c.is_active = 1'
    );
    foreach ($stmt->fetchAll() as $row) {
        try {
            $status = compute_service_status_helper((string)$row['id']);
            if (in_array($status['level'] ?? '', ['YELLOW', 'RED'], true)) {
                belm_notify_machine_owner_service_status($status, $row);
            }
            // Commercial inventory snapshot + Draft PI is still restricted
            // to BELM Service Provider mode by belm_prepare_service_due_alert.
            belm_prepare_service_due_alert((string)$row['id'], (float)$row['current_hours'], true);
        } catch (Throwable $error) {
            error_log('BELM service alert scan failed for machine ' . $row['id'] . ': ' . $error->getMessage());
        }
    }
}
