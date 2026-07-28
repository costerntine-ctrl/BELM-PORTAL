<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;

if ($method === 'GET') {
    // The Roles screen loads recycle-bin counts together with its other data.
    // Only irreversible restore/delete actions are reserved for Super Admin.
    require_page_access($user, 'roles');
} else {
    require_super_admin($user);
}

$TABLE_MAP = [
    'customer' => 'customers', 'machine' => 'machines', 'role' => 'roles', 'user' => 'users',
    'sparePart' => 'spare_parts', 'invoice' => 'invoices', 'proformaInvoice' => 'proforma_invoices',
    'companyExpense' => 'company_expenses', 'template' => 'checklist_templates', 'supplier' => 'suppliers',
];

if ($method === 'GET') {
    json_out(db()->query('SELECT * FROM trash_entries ORDER BY deleted_at DESC')->fetchAll());
}

if ($method === 'POST') { // restore
    $stmt = db()->prepare('SELECT * FROM trash_entries WHERE id = ?');
    $stmt->execute([$id]);
    $entry = $stmt->fetch();
    if (!$entry) json_error('Not found', 404);
    $table = $TABLE_MAP[$entry['entity_type']] ?? null;
    if ($table) {
        db()->prepare("UPDATE \"$table\" SET deleted_at = NULL WHERE id = ?")->execute([$entry['entity_id']]);
    }
    db()->prepare('DELETE FROM trash_entries WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

if ($method === 'DELETE') { // permanently delete
    $stmt = db()->prepare('SELECT * FROM trash_entries WHERE id = ?');
    $stmt->execute([$id]);
    $entry = $stmt->fetch();
    if (!$entry) json_error('Not found', 404);
    $table = $TABLE_MAP[$entry['entity_type']] ?? null;
    try {
        if ($table) {
            db()->prepare("DELETE FROM \"$table\" WHERE id = ?")->execute([$entry['entity_id']]);
        }
    } catch (PDOException $error) {
        if ($error->getCode() === '23503') {
            json_error('This record still has related data. Restore it or remove the related records first.', 409);
        }
        throw $error;
    }
    db()->prepare('DELETE FROM trash_entries WHERE id = ?')->execute([$id]);
    json_out(null, 204);
}

json_error('Unknown request', 404);
