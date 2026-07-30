<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'spare-parts');
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;

function spare_part_payload(array $body, ?string $excludeId = null): array {
    $partNumber = strtoupper(trim((string)($body['partNumber'] ?? '')));
    $name = trim((string)($body['name'] ?? ''));
    $category = trim((string)($body['category'] ?? ''));

    foreach (['stockQty', 'reorderThreshold', 'purchasePrice', 'sellingPrice'] as $field) {
        if (!array_key_exists($field, $body) || $body[$field] === '' || !is_numeric($body[$field])) {
            json_error('Complete every stock and price field with a valid number.');
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
        'name' => $name,
        'category' => $category !== '' ? $category : null,
        'stockQty' => (int)$stockQty,
        'reorderThreshold' => (int)$reorderThreshold,
        'purchasePrice' => $purchasePrice,
        'sellingPrice' => $sellingPrice,
    ];
}

if ($method === 'GET') {
    $stmt = db()->query('SELECT * FROM spare_parts WHERE deleted_at IS NULL ORDER BY name ASC');
    $parts = $stmt->fetchAll();
    if (($_GET['lowStock'] ?? '') === 'true') {
        $parts = array_values(array_filter($parts, fn($p) => $p['stock_qty'] <= 5));
    }
    json_out($parts);
}

if ($method === 'POST') {
    $part = spare_part_payload(body());
    $newId = uuid();
    db()->prepare('INSERT INTO spare_parts (id, part_number, name, category, stock_qty, reorder_threshold, purchase_price, selling_price, created_at) VALUES (?,?,?,?,?,?,?,?,NOW())')
        ->execute([
            $newId, $part['partNumber'], $part['name'], $part['category'],
            $part['stockQty'], $part['reorderThreshold'],
            $part['purchasePrice'], $part['sellingPrice'],
        ]);
    json_out(['id' => $newId, 'message' => 'Spare part saved successfully.'], 201);
}

if ($method === 'PUT') {
    if (!$id) json_error('Spare part ID is required.');
    $part = spare_part_payload(body(), $id);
    $stmt = db()->prepare('UPDATE spare_parts SET part_number=?, name=?, category=?, stock_qty=?, reorder_threshold=?, purchase_price=?, selling_price=? WHERE id=? AND deleted_at IS NULL');
    $stmt->execute([
        $part['partNumber'], $part['name'], $part['category'],
        $part['stockQty'], $part['reorderThreshold'],
        $part['purchasePrice'], $part['sellingPrice'], $id,
    ]);
    if ($stmt->rowCount() === 0) json_error('Spare part not found.', 404);
    json_out(['ok' => true, 'message' => 'Spare part updated successfully.']);
}

if ($method === 'DELETE') {
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
