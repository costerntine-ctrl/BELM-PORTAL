<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'spare-parts');
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;

if ($method === 'GET') {
    $stmt = db()->query('SELECT * FROM spare_parts WHERE deleted_at IS NULL ORDER BY name ASC');
    $parts = $stmt->fetchAll();
    if (($_GET['lowStock'] ?? '') === 'true') {
        $parts = array_values(array_filter($parts, fn($p) => $p['stock_qty'] <= $p['reorder_threshold']));
    }
    json_out($parts);
}

if ($method === 'POST') {
    $b = body();
    $partNumber = trim((string)($b['partNumber'] ?? ''));
    $name = trim((string)($b['name'] ?? ''));
    $stockQty = (float)($b['stockQty'] ?? -1);
    $reorderThreshold = (float)($b['reorderThreshold'] ?? -1);
    $purchasePrice = (float)($b['purchasePrice'] ?? -1);
    $sellingPrice = (float)($b['sellingPrice'] ?? -1);
    if ($partNumber === '') json_error('Part number is required.');
    if ($name === '') json_error('Spare-part name is required.');
    if ($stockQty < 0 || floor($stockQty) !== $stockQty) json_error('Stock quantity must be a non-negative whole number.');
    if ($reorderThreshold < 0 || floor($reorderThreshold) !== $reorderThreshold) json_error('Reorder level must be a non-negative whole number.');
    if ($purchasePrice < 0 || $sellingPrice < 0) json_error('Prices cannot be negative.');
    $newId = uuid();
    db()->prepare('INSERT INTO spare_parts (id, part_number, name, category, stock_qty, reorder_threshold, purchase_price, selling_price, created_at) VALUES (?,?,?,?,?,?,?,?,NOW())')
        ->execute([$newId, $partNumber, $name, $b['category'] ?? null, (int)$stockQty, (int)$reorderThreshold, $purchasePrice, $sellingPrice]);
    json_out(['id' => $newId], 201);
}

if ($method === 'PUT') {
    $b = body();
    $name = trim((string)($b['name'] ?? ''));
    $stockQty = (float)($b['stockQty'] ?? -1);
    $reorderThreshold = (float)($b['reorderThreshold'] ?? -1);
    $purchasePrice = (float)($b['purchasePrice'] ?? -1);
    $sellingPrice = (float)($b['sellingPrice'] ?? -1);
    if ($name === '') json_error('Spare-part name is required.');
    if ($stockQty < 0 || floor($stockQty) !== $stockQty) json_error('Stock quantity must be a non-negative whole number.');
    if ($reorderThreshold < 0 || floor($reorderThreshold) !== $reorderThreshold) json_error('Reorder level must be a non-negative whole number.');
    if ($purchasePrice < 0 || $sellingPrice < 0) json_error('Prices cannot be negative.');
    $stmt = db()->prepare('UPDATE spare_parts SET name=?, category=?, stock_qty=?, reorder_threshold=?, purchase_price=?, selling_price=? WHERE id=? AND deleted_at IS NULL');
    $stmt->execute([$name, $b['category'] ?? null, (int)$stockQty, (int)$reorderThreshold, $purchasePrice, $sellingPrice, $id]);
    if ($stmt->rowCount() === 0) json_error('Spare part not found.', 404);
    json_out(['ok' => true]);
}

if ($method === 'DELETE') {
    $stmt = db()->prepare('SELECT name FROM spare_parts WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    send_to_trash('sparePart', $id, $row['name'], $user['id']);
    soft_delete('spare_parts', $id);
    json_out(null, 204);
}

json_error('Unknown request', 404);
