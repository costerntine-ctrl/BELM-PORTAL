<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'billing');
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;

if ($method === 'GET') {
    json_out(db()->query('SELECT * FROM company_expenses WHERE deleted_at IS NULL ORDER BY date DESC')->fetchAll());
}

if ($method === 'POST') {
    $b = body();
    $date = trim((string)($b['date'] ?? ''));
    $category = strtoupper(trim((string)($b['category'] ?? 'OTHER')));
    $description = trim((string)($b['description'] ?? ''));
    $amount = (float)($b['amount'] ?? 0);
    $allowedCategories = ['SALARIES', 'RENT', 'FUEL', 'UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'OTHER'];
    if ($date === '') json_error('Expense date is required.');
    if (!in_array($category, $allowedCategories, true)) json_error('Invalid expense category.');
    if ($description === '') json_error('Expense description is required.');
    if ($amount <= 0) json_error('Expense amount must be greater than zero.');
    $newId = uuid();
    db()->prepare('INSERT INTO company_expenses (id, date, category, description, amount, recorded_by, receipt_url, created_at) VALUES (?,?,?,?,?,?,?,NOW())')
        ->execute([$newId, $date, $category, $description, $amount, $b['recordedBy'] ?? null, $b['receiptUrl'] ?? null]);
    json_out(['id' => $newId], 201);
}

if ($method === 'PUT') {
    $b = body();
    $date = trim((string)($b['date'] ?? ''));
    $category = strtoupper(trim((string)($b['category'] ?? 'OTHER')));
    $description = trim((string)($b['description'] ?? ''));
    $amount = (float)($b['amount'] ?? 0);
    $allowedCategories = ['SALARIES', 'RENT', 'FUEL', 'UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'OTHER'];
    if ($date === '') json_error('Expense date is required.');
    if (!in_array($category, $allowedCategories, true)) json_error('Invalid expense category.');
    if ($description === '') json_error('Expense description is required.');
    if ($amount <= 0) json_error('Expense amount must be greater than zero.');
    $stmt = db()->prepare('UPDATE company_expenses SET date=?, category=?, description=?, amount=?, recorded_by=?, receipt_url=? WHERE id=? AND deleted_at IS NULL');
    $stmt->execute([$date, $category, $description, $amount, $b['recordedBy'] ?? null, $b['receiptUrl'] ?? null, $id]);
    if ($stmt->rowCount() === 0) json_error('Expense not found.', 404);
    json_out(['ok' => true]);
}

if ($method === 'DELETE') {
    $stmt = db()->prepare('SELECT description, category FROM company_expenses WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    send_to_trash('companyExpense', $id, $row['description'] ?: $row['category'], $user['id']);
    soft_delete('company_expenses', $id);
    json_out(null, 204);
}

json_error('Unknown request', 404);
