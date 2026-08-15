<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? null;

if ($method === 'GET' && ($user['roleName'] ?? '') === 'Technician') {
    $machineType = trim((string)($_GET['machineType'] ?? ''));
    $assignedCustomerId = $user['assignedCustomerId'] ?? null;
    if ($action !== '' || $machineType === '' || !$assignedCustomerId) {
        json_error('Technicians can only load a checklist for an assigned machine type.', 403);
    }
    $stmt = db()->prepare(
        'SELECT 1 FROM machines
         WHERE customer_id = ? AND LOWER(machine_type) = LOWER(?) AND deleted_at IS NULL
         LIMIT 1'
    );
    $stmt->execute([$assignedCustomerId, $machineType]);
    if (!$stmt->fetch()) json_error('You are not assigned to this machine type.', 403);
} elseif ($method === 'GET') {
    require_page_access($user, 'checklist-templates');
} else {
    require_page_access($user, 'checklist-templates');
}

function fetch_items(string $templateId): array {
    $stmt = db()->prepare('SELECT * FROM checklist_template_items WHERE template_id = ? ORDER BY "order" ASC');
    $stmt->execute([$templateId]);
    $items = $stmt->fetchAll();
    foreach ($items as &$it) {
        $it['inputType'] = $it['input_type'];
        $it['safetyLevel'] = $it['safety_level'];
        $it['options'] = $it['options'] ? json_decode($it['options'], true) : null;
        $it['optionSafety'] = $it['option_safety'] ? json_decode($it['option_safety'], true) : null;
        $it['isRequired'] = (bool)$it['is_required'];
        unset(
            $it['input_type'],
            $it['safety_level'],
            $it['option_safety'],
            $it['is_required']
        );
    }
    return $items;
}

function fetch_service_parts(string $templateId): array {
    $stmt = db()->prepare(
        'SELECT id, spare_name, part_number, quantity, "order"
         FROM checklist_template_parts
         WHERE template_id = ?
         ORDER BY "order" ASC'
    );
    $stmt->execute([$templateId]);
    $parts = $stmt->fetchAll();
    foreach ($parts as &$part) {
        $part['spareName'] = $part['spare_name'];
        $part['partNumber'] = $part['part_number'];
        unset($part['spare_name'], $part['part_number']);
    }
    unset($part);
    return $parts;
}

function fetch_template(string $templateId): ?array {
    $stmt = db()->prepare('SELECT * FROM checklist_templates WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$templateId]);
    $template = $stmt->fetch();
    if (!$template) return null;
    $template['machineType'] = $template['machine_type'];
    $template['isActive'] = (bool)$template['is_active'];
    $template['serviceType'] = $template['service_type'] ?: 'General Service';
    unset($template['machine_type'], $template['is_active'], $template['service_type']);
    $template['items'] = fetch_items($templateId);
    $template['serviceParts'] = fetch_service_parts($templateId);
    return $template;
}

function normalize_service_part(array $part, int $order): array {
    $spareName = trim((string)($part['spareName'] ?? $part['spare_name'] ?? ''));
    $partNumber = strtoupper(trim((string)($part['partNumber'] ?? $part['part_number'] ?? '')));
    $quantity = (float)($part['quantity'] ?? 0);
    if ($spareName === '') json_error('Every service part must have a spare-parts name.');
    if ($partNumber === '') json_error("Add a part number for \"$spareName\".");
    if ($quantity <= 0) json_error("Quantity for \"$spareName\" must be greater than zero.");
    return [
        'spareName' => $spareName,
        'partNumber' => $partNumber,
        'quantity' => $quantity,
        'order' => $order,
    ];
}

function normalize_template_item(array $item, int $order): array {
    $label = trim((string)($item['label'] ?? ''));
    $inputType = strtoupper(trim((string)($item['inputType'] ?? 'TEXT')));
    $safetyLevel = strtoupper(trim((string)($item['safetyLevel'] ?? 'GREEN')));
    $allowedInputTypes = ['TEXT', 'NUMBER', 'YES_NO', 'DROPDOWN', 'PHOTO', 'DATE'];
    $allowedSafetyLevels = ['NONE', 'GREEN', 'YELLOW', 'RED'];

    if ($label === '') json_error('Every checklist item must have a label.');
    if (!in_array($inputType, $allowedInputTypes, true)) {
        json_error("Unsupported checklist input type: $inputType.");
    }
    if (!in_array($safetyLevel, $allowedSafetyLevels, true)) {
        json_error("Unsupported checklist safety level: $safetyLevel.");
    }

    $options = [];
    if (isset($item['options']) && is_array($item['options'])) {
        foreach ($item['options'] as $option) {
            $value = trim((string)$option);
            if ($value !== '' && !in_array($value, $options, true)) $options[] = $value;
        }
    }
    if ($inputType === 'DROPDOWN' && count($options) === 0) {
        json_error("Add at least one dropdown value for \"$label\".");
    }
    if ($inputType === 'YES_NO' && count($options) === 0) {
        $options = ['YES', 'NO'];
    }

    $optionSafety = [];
    if (isset($item['optionSafety']) && is_array($item['optionSafety'])) {
        foreach ($item['optionSafety'] as $option => $level) {
            $level = strtoupper(trim((string)$level));
            if (in_array((string)$option, $options, true) && in_array($level, $allowedSafetyLevels, true)) {
                $optionSafety[(string)$option] = $level;
            }
        }
    }

    return [
        'label' => $label,
        'inputType' => $inputType,
        'safetyLevel' => $safetyLevel,
        'options' => count($options) > 0 ? $options : null,
        'optionSafety' => count($optionSafety) > 0 ? $optionSafety : null,
        'order' => $order,
        'isRequired' => array_key_exists('isRequired', $item) ? (bool)$item['isRequired'] : true,
    ];
}

function normalize_template_payload(array $body, bool $requireItems): array {
    $name = trim((string)($body['name'] ?? ''));
    $machineType = trim((string)($body['machineType'] ?? ''));
    $serviceType = trim((string)($body['serviceType'] ?? 'General Service'));
    if ($name === '') json_error('Template name is required.');
    if ($machineType === '') json_error('Machine type is required.');
    if ($serviceType === '') json_error('Service type is required.');

    $normalizedItems = null;
    if (array_key_exists('items', $body)) {
        if (!is_array($body['items'])) json_error('Checklist items must be a list.');
        $normalizedItems = [];
        foreach ($body['items'] as $order => $item) {
            if (!is_array($item)) json_error('Invalid checklist item.');
            $normalizedItems[] = normalize_template_item($item, $order);
        }
    }
    if ($requireItems && (!$normalizedItems || count($normalizedItems) === 0)) {
        json_error('Add at least one checklist item before saving.');
    }

    $normalizedServiceParts = null;
    if (array_key_exists('serviceParts', $body)) {
        if (!is_array($body['serviceParts'])) json_error('Service parts must be a list.');
        $normalizedServiceParts = [];
        foreach ($body['serviceParts'] as $order => $part) {
            if (!is_array($part)) json_error('Invalid service part.');
            $normalizedServiceParts[] = normalize_service_part($part, $order);
        }
    }

    return [
        'name' => $name,
        'machineType' => $machineType,
        'serviceType' => $serviceType,
        'isActive' => array_key_exists('isActive', $body) ? ((bool)$body['isActive'] ? 1 : 0) : 1,
        'items' => $normalizedItems,
        'serviceParts' => $normalizedServiceParts,
    ];
}

function insert_template_item(string $templateId, array $item, ?string $itemId = null): string {
    $newId = $itemId ?: uuid();
    db()->prepare(
        'INSERT INTO checklist_template_items
         (id, template_id, label, input_type, safety_level, options, option_safety, "order", is_required)
         VALUES (?,?,?,?,?,CAST(? AS JSONB),CAST(? AS JSONB),?,?)'
    )->execute([
        $newId,
        $templateId,
        $item['label'],
        $item['inputType'],
        $item['safetyLevel'],
        $item['options'] !== null ? json_encode($item['options']) : null,
        $item['optionSafety'] !== null ? json_encode($item['optionSafety']) : null,
        $item['order'],
        $item['isRequired'] ? 1 : 0,
    ]);
    return $newId;
}

function insert_template_service_part(string $templateId, array $part): string {
    $newId = uuid();
    db()->prepare(
        'INSERT INTO checklist_template_parts
         (id, template_id, spare_name, part_number, quantity, "order")
         VALUES (?,?,?,?,?,?)'
    )->execute([
        $newId,
        $templateId,
        $part['spareName'],
        $part['partNumber'],
        $part['quantity'],
        $part['order'],
    ]);
    return $newId;
}

if ($method === 'GET' && !$action) {
    $machineType = $_GET['machineType'] ?? null;
    if ($machineType) {
        $activeClause = ($user['roleName'] ?? '') === 'Technician' ? ' AND is_active = 1' : '';
        $stmt = db()->prepare(
            "SELECT * FROM checklist_templates
             WHERE deleted_at IS NULL AND LOWER(machine_type) = LOWER(?)$activeClause
             ORDER BY created_at DESC"
        );
        $stmt->execute([$machineType]);
    } else {
        $stmt = db()->query('SELECT * FROM checklist_templates WHERE deleted_at IS NULL ORDER BY created_at DESC');
    }
    $templates = $stmt->fetchAll();
    foreach ($templates as &$t) {
        $t['machineType'] = $t['machine_type'];
        $t['isActive'] = (bool)$t['is_active'];
        $t['serviceType'] = $t['service_type'] ?: 'General Service';
        unset($t['machine_type'], $t['is_active'], $t['service_type']);
        $t['items'] = fetch_items($t['id']);
        $t['serviceParts'] = fetch_service_parts($t['id']);
    }
    json_out($templates);
}

if ($method === 'GET' && $action === 'one') {
    $t = fetch_template($id);
    if (!$t) json_error('Not found', 404);
    json_out($t);
}

if ($method === 'POST' && !$action) {
    $payload = normalize_template_payload(body(), true);
    $newId = uuid();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO checklist_templates
             (id, name, machine_type, service_type, is_active, created_at)
             VALUES (?,?,?,?,?,NOW())'
        )->execute([
            $newId,
            $payload['name'],
            $payload['machineType'],
            $payload['serviceType'],
            $payload['isActive'],
        ]);
        foreach ($payload['items'] as $item) insert_template_item($newId, $item);
        foreach ($payload['serviceParts'] ?? [] as $part) {
            insert_template_service_part($newId, $part);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    log_activity($user, 'checklist-template-created', 'checklistTemplate', $newId, ['name' => $payload['name']]);
    json_out(fetch_template($newId), 201);
}

if ($method === 'PUT' && !$action) {
    $existing = fetch_template($id);
    if (!$existing) json_error('Checklist template not found.', 404);
    $b = body();
    require_edit_confirmation($user, $b);
    $payload = normalize_template_payload($b, false);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'UPDATE checklist_templates
             SET name=?, machine_type=?, service_type=?, is_active=?
             WHERE id=?'
        )->execute([
            $payload['name'],
            $payload['machineType'],
            $payload['serviceType'] ?: ($existing['serviceType'] ?? 'General Service'),
            $payload['isActive'],
            $id,
        ]);
        if ($payload['items'] !== null) {
            $pdo->prepare('DELETE FROM checklist_template_items WHERE template_id = ?')->execute([$id]);
            foreach ($payload['items'] as $item) insert_template_item($id, $item);
        }
        if ($payload['serviceParts'] !== null) {
            $pdo->prepare('DELETE FROM checklist_template_parts WHERE template_id = ?')->execute([$id]);
            foreach ($payload['serviceParts'] as $part) insert_template_service_part($id, $part);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    log_activity($user, 'checklist-template-edited', 'checklistTemplate', $id, ['name' => $payload['name']]);
    json_out(fetch_template($id));
}

if ($method === 'POST' && $action === 'add-item') {
    if (!fetch_template($id)) json_error('Checklist template not found.', 404);
    $body = body();
    $item = normalize_template_item($body, (int)($body['order'] ?? 0));
    $newId = insert_template_item($id, $item);
    json_out(['id' => $newId], 201);
}

if ($method === 'PUT' && $action === 'edit-item') {
    $body = body();
    require_edit_confirmation($user, $body);
    $item = normalize_template_item($body, (int)($body['order'] ?? 0));
    $stmt = db()->prepare(
        'UPDATE checklist_template_items
         SET label=?, input_type=?, safety_level=?, options=CAST(? AS JSONB),
             option_safety=CAST(? AS JSONB), "order"=?, is_required=?
         WHERE id=?'
    );
    $stmt->execute([
        $item['label'],
        $item['inputType'],
        $item['safetyLevel'],
        $item['options'] !== null ? json_encode($item['options']) : null,
        $item['optionSafety'] !== null ? json_encode($item['optionSafety']) : null,
        $item['order'],
        $item['isRequired'] ? 1 : 0,
        $_GET['itemId'],
    ]);
    if ($stmt->rowCount() === 0) json_error('Checklist item not found.', 404);
    json_out(['ok' => true]);
}

if ($method === 'DELETE' && $action === 'delete-item') {
    require_edit_confirmation($user, body());
    db()->prepare('DELETE FROM checklist_template_items WHERE id = ?')->execute([$_GET['itemId']]);
    json_out(null, 204);
}

if ($method === 'DELETE' && !$action) {
    $stmt = db()->prepare('SELECT name FROM checklist_templates WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    $reason = require_delete_confirmation($user, body());
    send_to_trash('template', $id, $row['name'], $user['id'], $reason);
    soft_delete('checklist_templates', $id);
    log_activity($user, 'checklist-template-deleted', 'checklistTemplate', $id, ['name' => $row['name'], 'reason' => $reason]);
    json_out(null, 204);
}

json_error('Unknown request', 404);
