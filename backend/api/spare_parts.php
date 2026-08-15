<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
// Customer Self-Service technicians must never see BELM's internal Inventory,
// even if the shared Technician role carries the spare-parts page permission.
// They can recommend a part manually; the customer then explicitly requests
// BELM support and BELM staff select the internal inventory record.
if (($user['roleName'] ?? '') === 'Technician' && !empty($user['assignedCustomerId'])) {
    $modeStmt = db()->prepare(
        'SELECT c.is_machinery_admin, u.is_customer_managed
         FROM users u JOIN customers c ON c.id = u.assigned_customer_id
         WHERE u.id = ? AND c.id = ? AND u.deleted_at IS NULL AND c.deleted_at IS NULL'
    );
    $modeStmt->execute([(string)$user['id'], (string)$user['assignedCustomerId']]);
    $modeRow = $modeStmt->fetch();
    if ($modeRow && !empty($modeRow['is_machinery_admin']) && !empty($modeRow['is_customer_managed'])) {
        json_error('BELM Spare Parts Inventory is private in Customer Self-Service Mode.', 403);
    }
}
require_page_access($user, 'spare-parts');
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;
$action = $_GET['action'] ?? '';

// Which measurement fields make sense for a given category — purely
// informational for the frontend to know which fields to show; the
// backend still accepts/stores whatever is sent regardless of category,
// so this never blocks an edge-case part that doesn't fit neatly.
const SPARE_PART_CATEGORIES = ['BEARING', 'FILTER', 'AIR_CLEANER', 'VALVE', 'OTHER'];

function spare_part_payload(array $body, ?string $excludeId = null): array {
    $partNumber = strtoupper(trim((string)($body['partNumber'] ?? '')));
    $referenceNumber = strtoupper(trim((string)($body['referenceNumber'] ?? '')));
    $name = trim((string)($body['name'] ?? ''));
    $category = strtoupper(trim((string)($body['category'] ?? '')));
    $machineBrand = trim((string)($body['machineBrand'] ?? ''));
    $machineType = trim((string)($body['machineType'] ?? ''));
    $threadSize = trim((string)($body['threadSize'] ?? ''));

    foreach (['stockQty', 'reorderThreshold', 'purchasePrice', 'sellingPrice'] as $field) {
        if (!array_key_exists($field, $body) || $body[$field] === '' || !is_numeric($body[$field])) {
            json_error('Complete every stock and price field with a valid number.');
        }
    }
    foreach (['heightMm', 'lengthMm', 'outerDiameterMm', 'innerDiameterMm'] as $field) {
        if (array_key_exists($field, $body) && $body[$field] !== '' && !is_numeric($body[$field])) {
            json_error('Measurements must be numbers (mm).');
        }
    }

    $stockQty = (float)$body['stockQty'];
    $reorderThreshold = (float)$body['reorderThreshold'];
    $purchasePrice = (float)$body['purchasePrice'];
    $sellingPrice = (float)$body['sellingPrice'];
    if ($partNumber === '') json_error('Part number is required.');
    if ($name === '') json_error('Spare-part name is required.');
    if ($stockQty < 0 || floor($stockQty) !== $stockQty) json_error('Stock quantity must be a non-negative whole number.');
    if ($reorderThreshold < 0 || floor($reorderThreshold) !== $reorderThreshold) json_error('Reorder level must be a non-negative whole number.');
    if ($purchasePrice < 0 || $sellingPrice < 0) json_error('Prices cannot be negative.');

    $sql = 'SELECT id FROM spare_parts WHERE UPPER(part_number) = UPPER(?)';
    $params = [$partNumber];
    if ($excludeId !== null) {
        $sql .= ' AND id <> ?';
        $params[] = $excludeId;
    }
    $stmt = db()->prepare($sql . ' LIMIT 1');
    $stmt->execute($params);
    if ($stmt->fetch()) json_error('This part number already exists. Open that record and edit it instead.', 409);

    return [
        'partNumber' => $partNumber,
        'referenceNumber' => $referenceNumber !== '' ? $referenceNumber : null,
        'name' => $name,
        'category' => $category !== '' ? $category : null,
        'stockQty' => (int)$stockQty,
        'reorderThreshold' => (int)$reorderThreshold,
        'purchasePrice' => $purchasePrice,
        'sellingPrice' => $sellingPrice,
        'machineBrand' => $machineBrand !== '' ? $machineBrand : null,
        'machineType' => $machineType !== '' ? $machineType : null,
        'heightMm' => ($body['heightMm'] ?? '') !== '' ? (float)$body['heightMm'] : null,
        'lengthMm' => ($body['lengthMm'] ?? '') !== '' ? (float)$body['lengthMm'] : null,
        'outerDiameterMm' => ($body['outerDiameterMm'] ?? '') !== '' ? (float)$body['outerDiameterMm'] : null,
        'innerDiameterMm' => ($body['innerDiameterMm'] ?? '') !== '' ? (float)$body['innerDiameterMm'] : null,
        'threadSize' => $threadSize !== '' ? $threadSize : null,
    ];
}

function fetch_equivalents(string $partId): array {
    $stmt = db()->prepare(
        'SELECT sp.id, sp.part_number, sp.reference_number, sp.name
         FROM spare_part_equivalents e
         JOIN spare_parts sp ON sp.id = e.equivalent_part_id AND sp.deleted_at IS NULL
         WHERE e.spare_part_id = ?
         ORDER BY sp.name ASC'
    );
    $stmt->execute([$partId]);
    return array_map(fn($row) => [
        'id' => $row['id'],
        'partNumber' => $row['part_number'],
        'referenceNumber' => $row['reference_number'],
        'name' => $row['name'],
    ], $stmt->fetchAll());
}

// GET ?action=search-with-equivalents&q=670 — used by the picker on
// Proforma/checklist forms: a plain text search across part number,
// reference number and name, but ALSO surfaces parts that are marked
// equivalent to a direct match (so searching "670" for "LF670" also
// brings back whatever other brand's part is linked as its equivalent).
if ($method === 'GET' && $action === 'search-with-equivalents') {
    $q = trim((string)($_GET['q'] ?? ''));
    if ($q === '') json_out([]);
    $stmt = db()->prepare(
        "SELECT * FROM spare_parts
         WHERE deleted_at IS NULL
           AND (part_number ILIKE ? OR reference_number ILIKE ? OR name ILIKE ?)
         ORDER BY name ASC LIMIT 20"
    );
    $like = '%' . $q . '%';
    $stmt->execute([$like, $like, $like]);
    $directMatches = $stmt->fetchAll();
    $matchIds = array_column($directMatches, 'id');

    $equivalentIds = [];
    if ($matchIds) {
        $placeholders = implode(',', array_fill(0, count($matchIds), '?'));
        $eqStmt = db()->prepare(
            "SELECT DISTINCT equivalent_part_id FROM spare_part_equivalents
             WHERE spare_part_id IN ($placeholders)"
        );
        $eqStmt->execute($matchIds);
        $equivalentIds = array_diff($eqStmt->fetchAll(PDO::FETCH_COLUMN), $matchIds);
    }

    $equivalentRows = [];
    if ($equivalentIds) {
        $placeholders = implode(',', array_fill(0, count($equivalentIds), '?'));
        $eqPartsStmt = db()->prepare("SELECT * FROM spare_parts WHERE id IN ($placeholders) AND deleted_at IS NULL");
        $eqPartsStmt->execute(array_values($equivalentIds));
        $equivalentRows = $eqPartsStmt->fetchAll();
    }

    $result = [];
    foreach ($directMatches as $row) $result[] = ['isEquivalentMatch' => false] + $row;
    foreach ($equivalentRows as $row) $result[] = ['isEquivalentMatch' => true] + $row;
    json_out($result);
}

// POST ?action=link-equivalent  { partId, equivalentPartId }
if ($method === 'POST' && $action === 'link-equivalent') {
    $b = body();
    $partId = trim((string)($b['partId'] ?? ''));
    $equivalentPartId = trim((string)($b['equivalentPartId'] ?? ''));
    if ($partId === '' || $equivalentPartId === '' || $partId === $equivalentPartId) {
        json_error('Choose a different, valid spare part to link as equivalent.');
    }
    $checkStmt = db()->prepare('SELECT COUNT(*) FROM spare_parts WHERE id IN (?, ?) AND deleted_at IS NULL');
    $checkStmt->execute([$partId, $equivalentPartId]);
    if ((int)$checkStmt->fetchColumn() !== 2) json_error('One of the selected spare parts was not found.', 404);

    // Stored both directions so a lookup from either part instantly finds
    // the other — "equivalent" is inherently a two-way relationship.
    db()->prepare('INSERT INTO spare_part_equivalents (id, spare_part_id, equivalent_part_id) VALUES (?,?,?) ON CONFLICT DO NOTHING')
        ->execute([uuid(), $partId, $equivalentPartId]);
    db()->prepare('INSERT INTO spare_part_equivalents (id, spare_part_id, equivalent_part_id) VALUES (?,?,?) ON CONFLICT DO NOTHING')
        ->execute([uuid(), $equivalentPartId, $partId]);
    log_activity($user, 'spare-part-equivalent-linked', 'sparePart', $partId, ['equivalentPartId' => $equivalentPartId]);
    json_out(['ok' => true, 'equivalents' => fetch_equivalents($partId)]);
}

// DELETE ?action=unlink-equivalent&partId=X&equivalentPartId=Y
if ($method === 'DELETE' && $action === 'unlink-equivalent') {
    $partId = trim((string)($_GET['partId'] ?? ''));
    $equivalentPartId = trim((string)($_GET['equivalentPartId'] ?? ''));
    if ($partId === '' || $equivalentPartId === '') json_error('Both spare parts are required.');
    db()->prepare('DELETE FROM spare_part_equivalents WHERE (spare_part_id = ? AND equivalent_part_id = ?) OR (spare_part_id = ? AND equivalent_part_id = ?)')
        ->execute([$partId, $equivalentPartId, $equivalentPartId, $partId]);
    log_activity($user, 'spare-part-equivalent-unlinked', 'sparePart', $partId, ['equivalentPartId' => $equivalentPartId]);
    json_out(['ok' => true, 'equivalents' => fetch_equivalents($partId)]);
}

if ($method === 'GET' && $action === 'equivalents') {
    if (!$id) json_error('Spare part ID is required.');
    json_out(fetch_equivalents($id));
}

// GET ?action=all-equivalents — the whole equivalence graph in one call
// (part_id => [equivalent part_number, ...]), fetched once when the
// inventory list loads so the search box can match "670" against any
// part that's linked as equivalent to an LF670-style match, without a
// network round-trip per keystroke.
if ($method === 'GET' && $action === 'all-equivalents') {
    $stmt = db()->query(
        'SELECT e.spare_part_id, sp.part_number, sp.reference_number, sp.name
         FROM spare_part_equivalents e
         JOIN spare_parts sp ON sp.id = e.equivalent_part_id AND sp.deleted_at IS NULL'
    );
    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        $map[$row['spare_part_id']][] = trim(
            ($row['part_number'] ?? '') . ' ' . ($row['reference_number'] ?? '') . ' ' . ($row['name'] ?? '')
        );
    }
    json_out($map);
}

if ($method === 'GET' && !$action) {
    $stmt = db()->query('SELECT * FROM spare_parts WHERE deleted_at IS NULL ORDER BY name ASC');
    $parts = $stmt->fetchAll();
    if (($_GET['lowStock'] ?? '') === 'true') {
        $parts = array_values(array_filter($parts, fn($p) => $p['stock_qty'] <= 5));
    }
    foreach ($parts as &$part) {
        $countStmt = db()->prepare('SELECT COUNT(*) FROM spare_part_equivalents WHERE spare_part_id = ?');
        $countStmt->execute([$part['id']]);
        $part['equivalentCount'] = (int)$countStmt->fetchColumn();
    }
    unset($part);
    json_out($parts);
}

if ($method === 'POST' && !$action) {
    $part = spare_part_payload(body());
    $newId = uuid();
    db()->prepare(
        'INSERT INTO spare_parts
         (id, part_number, reference_number, name, category, stock_qty, reorder_threshold,
          purchase_price, selling_price, machine_brand, machine_type,
          height_mm, length_mm, outer_diameter_mm, inner_diameter_mm, thread_size, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())'
    )->execute([
        $newId, $part['partNumber'], $part['referenceNumber'], $part['name'], $part['category'],
        $part['stockQty'], $part['reorderThreshold'],
        $part['purchasePrice'], $part['sellingPrice'],
        $part['machineBrand'], $part['machineType'],
        $part['heightMm'], $part['lengthMm'], $part['outerDiameterMm'], $part['innerDiameterMm'], $part['threadSize'],
    ]);
    log_activity($user, 'spare-part-created', 'sparePart', $newId, ['name' => $part['name']]);
    json_out(['id' => $newId, 'message' => 'Spare part saved successfully.'], 201);
}

if ($method === 'PUT' && !$action) {
    if (!$id) json_error('Spare part ID is required.');
    $b = body();
    require_edit_confirmation($user, $b);
    $part = spare_part_payload($b, $id);
    $stmt = db()->prepare(
        'UPDATE spare_parts
         SET part_number=?, reference_number=?, name=?, category=?, stock_qty=?, reorder_threshold=?,
             purchase_price=?, selling_price=?, machine_brand=?, machine_type=?,
             height_mm=?, length_mm=?, outer_diameter_mm=?, inner_diameter_mm=?, thread_size=?
         WHERE id=? AND deleted_at IS NULL'
    );
    $stmt->execute([
        $part['partNumber'], $part['referenceNumber'], $part['name'], $part['category'],
        $part['stockQty'], $part['reorderThreshold'],
        $part['purchasePrice'], $part['sellingPrice'],
        $part['machineBrand'], $part['machineType'],
        $part['heightMm'], $part['lengthMm'], $part['outerDiameterMm'], $part['innerDiameterMm'], $part['threadSize'],
        $id,
    ]);
    if ($stmt->rowCount() === 0) json_error('Spare part not found.', 404);
    log_activity($user, 'spare-part-edited', 'sparePart', $id, ['name' => $part['name']]);
    json_out(['ok' => true, 'message' => 'Spare part updated successfully.']);
}

if ($method === 'DELETE' && !$action) {
    $stmt = db()->prepare('SELECT name FROM spare_parts WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    $reason = require_delete_confirmation($user, body());
    send_to_trash('sparePart', $id, $row['name'], $user['id'], $reason);
    soft_delete('spare_parts', $id);
    json_out(null, 204);
}

json_error('Unknown request', 404);
