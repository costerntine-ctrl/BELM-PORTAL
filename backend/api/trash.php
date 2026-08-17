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
    'receipt' => 'receipts', 'controllerPinout' => 'controller_pinouts',
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
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $linkedJobId = '';
        if ($table) {
            if ($entry['entity_type'] === 'invoice') {
                $source = $pdo->prepare('SELECT source_job_card_id,status FROM invoices WHERE id=?');
                $source->execute([$entry['entity_id']]);
                $document = $source->fetch();
                $linkedJobId = (string)($document['source_job_card_id'] ?? '');
                if ($linkedJobId !== '' && strtoupper((string)($document['status'] ?? '')) !== 'CANCELLED') {
                    $duplicate = $pdo->prepare("SELECT invoice_no FROM invoices WHERE source_job_card_id=? AND id<>? AND deleted_at IS NULL AND status<>'CANCELLED' LIMIT 1");
                    $duplicate->execute([$linkedJobId, $entry['entity_id']]);
                    if ($duplicateNo = $duplicate->fetchColumn()) {
                        throw new DomainException('Cannot restore this Invoice because another active Invoice already exists for the linked Job Card: '.$duplicateNo.'.');
                    }
                }
            } elseif ($entry['entity_type'] === 'proformaInvoice') {
                $source = $pdo->prepare('SELECT source_job_card_id FROM proforma_invoices WHERE id=?');
                $source->execute([$entry['entity_id']]);
                $linkedJobId = (string)($source->fetchColumn() ?: '');
                if ($linkedJobId !== '') {
                    $duplicate = $pdo->prepare('SELECT invoice_no FROM proforma_invoices WHERE source_job_card_id=? AND id<>? AND deleted_at IS NULL LIMIT 1');
                    $duplicate->execute([$linkedJobId, $entry['entity_id']]);
                    if ($duplicateNo = $duplicate->fetchColumn()) {
                        throw new DomainException('Cannot restore this Proforma because another active Proforma already exists for the linked Job Card: '.$duplicateNo.'.');
                    }
                }
            }

            $pdo->prepare("UPDATE \"$table\" SET deleted_at = NULL WHERE id = ?")->execute([$entry['entity_id']]);
            if ($linkedJobId !== '') belm_recompute_job_billing_status($linkedJobId);
        }
        $pdo->prepare('DELETE FROM trash_entries WHERE id = ?')->execute([$id]);
        $pdo->commit();
    } catch (DomainException $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        json_error($error->getMessage(), 409);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    json_out(['ok' => true]);
}

if ($method === 'DELETE') { // permanently delete
    $reason = require_delete_confirmation($user, body());
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
