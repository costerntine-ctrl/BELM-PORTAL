<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/table_pdf_helper.php';

$user = require_auth();
require_page_access($user, 'billing');
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;
$action = $_GET['action'] ?? '';

function compute_totals(array $items, float $discount, string $vatMode): array {
    $subtotal = array_sum(array_map(fn($i) => $i['qty'] * $i['unit_price'], $items));
    $vat = $vatMode === 'VAT' ? ($subtotal - $discount) * 0.18 : 0;
    return ['subtotal' => $subtotal, 'discount' => $discount, 'vat' => $vat, 'grandTotal' => $subtotal - $discount + $vat];
}

if ($method === 'GET' && $action === 'export-one') {
    $proformaId = trim((string)($_GET['proformaId'] ?? ''));
    $stmt = db()->prepare(
        'SELECT p.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
         FROM proforma_invoices p JOIN customers c ON c.id = p.customer_id
         WHERE p.id = ? AND p.deleted_at IS NULL'
    );
    $stmt->execute([$proformaId]);
    $proforma = $stmt->fetch();
    if (!$proforma) json_error('Proforma not found.', 404);

    $itemsStmt = db()->prepare('SELECT section, part_number, description, qty, unit, unit_price FROM proforma_invoice_items WHERE proforma_id = ? ORDER BY "order" ASC');
    $itemsStmt->execute([$proformaId]);
    $items = $itemsStmt->fetchAll();
    $totals = compute_totals($items, (float)$proforma['discount'], (string)$proforma['vat_mode']);

    $rows = [];
    foreach ($items as $item) {
        $rows[] = [
            $item['part_number'] ?: '—',
            $item['description'],
            'Qty: ' . $item['qty'] . ' ' . $item['unit'],
            'Unit: TZS ' . number_format((float)$item['unit_price'], 2),
            'Line total: TZS ' . number_format($item['qty'] * $item['unit_price'], 2),
        ];
    }

    output_table_pdf(
        'BELM-' . $proforma['invoice_no'] . '.pdf',
        'BELM General Tech Service Limited — Proforma ' . $proforma['invoice_no'],
        [
            'Customer: ' . $proforma['customer_name'] . ' (' . ($proforma['customer_email'] ?: '—') . ', ' . ($proforma['customer_phone'] ?: '—') . ')',
            'Date: ' . display_date_billing((string)$proforma['date']) . '   VAT mode: ' . (string)$proforma['vat_mode'],
            'Subtotal: TZS ' . number_format($totals['subtotal'], 2) . '   Discount: TZS ' . number_format($totals['discount'], 2)
                . '   VAT: TZS ' . number_format($totals['vat'], 2) . '   Grand total: TZS ' . number_format($totals['grandTotal'], 2),
            'Generated: ' . date('d/m/Y H:i'),
        ],
        $rows
    );
}

if ($method === 'GET' && $action === 'export') {
    $stmt = db()->query(
        'SELECT p.invoice_no, p.date, p.discount, p.vat_mode, c.name AS customer_name, p.id
         FROM proforma_invoices p JOIN customers c ON c.id = p.customer_id
         WHERE p.deleted_at IS NULL ORDER BY p.date DESC'
    );
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $itemsStmt = db()->prepare('SELECT qty, unit_price FROM proforma_invoice_items WHERE proforma_id = ?');
        $itemsStmt->execute([$row['id']]);
        $items = $itemsStmt->fetchAll();
        $totals = compute_totals($items, (float)$row['discount'], (string)$row['vat_mode']);
        $rows[] = [
            $row['invoice_no'],
            $row['customer_name'],
            display_date_billing((string)$row['date']),
            'Total: TZS ' . number_format($totals['grandTotal'], 2),
            (string)($row['vat_mode'] ?? '—'),
        ];
    }
    output_table_pdf(
        'BELM-proforma-' . date('Ymd-His') . '.pdf',
        'BELM General Tech Service Limited — Proforma Invoices Report',
        ['Generated: ' . date('d/m/Y H:i'), 'Total records: ' . count($rows)],
        $rows
    );
}

if ($method === 'GET') {
    $stmt = db()->query('SELECT p.*, c.name AS customer_name FROM proforma_invoices p JOIN customers c ON c.id = p.customer_id WHERE p.deleted_at IS NULL ORDER BY p.date DESC');
    $proformas = $stmt->fetchAll();
    foreach ($proformas as &$p) {
        $p['customer'] = ['id' => $p['customer_id'], 'name' => $p['customer_name']];
        unset($p['customer_name']);
        $stmt2 = db()->prepare('SELECT * FROM proforma_invoice_items WHERE proforma_id = ? ORDER BY "order" ASC');
        $stmt2->execute([$p['id']]);
        $p['items'] = $stmt2->fetchAll();
        $p['totals'] = compute_totals($p['items'], (float)$p['discount'], $p['vat_mode']);
    }
    json_out($proformas);
}

if ($method === 'POST') {
    $b = body();
    $items = $b['items'] ?? [];
    $customerId = trim((string)($b['customerId'] ?? ''));
    $date = trim((string)($b['date'] ?? ''));
    $vatMode = strtoupper(trim((string)($b['vatMode'] ?? 'VAT')));
    $discount = (float)($b['discount'] ?? 0);
    if (!is_array($items) || count($items) === 0) json_error('Add at least one proforma item.');
    if ($date === '' || DateTime::createFromFormat('Y-m-d', $date) === false) {
        json_error('Select a valid proforma date.');
    }
    if (!in_array($vatMode, ['VAT', 'NO_VAT'], true)) json_error('Invalid VAT mode.');
    if ($discount < 0) json_error('Discount cannot be negative.');
    $stmt = db()->prepare('SELECT 1 FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
    $stmt->execute([$customerId]);
    if (!$stmt->fetch()) json_error('Select an active customer.', 422);
    $subtotal = 0;
    foreach ($items as $item) {
        if (trim((string)($item['description'] ?? '')) === '') json_error('Every proforma item needs a description.');
        if (!is_numeric($item['qty'] ?? null)
            || (float)$item['qty'] <= 0
            || floor((float)$item['qty']) !== (float)$item['qty']) {
            json_error('Proforma quantity must be a whole number greater than zero.');
        }
        if (!is_numeric($item['unitPrice'] ?? null) || (float)$item['unitPrice'] < 0) json_error('Proforma price cannot be negative.');
        $subtotal += (int)$item['qty'] * (float)$item['unitPrice'];
    }
    if ($discount > $subtotal) json_error('Discount cannot be greater than the subtotal.');
    $newId = uuid();
    $invoiceNo = document_number('PRO');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO proforma_invoices (id, customer_id, invoice_no, date, vat_mode, discount, created_at) VALUES (?,?,?,?,?,?,NOW())')
            ->execute([$newId, $customerId, $invoiceNo, $date, $vatMode, $discount]);
        $itemStmt = $pdo->prepare(
            'INSERT INTO proforma_invoice_items
             (id, proforma_id, section, part_number, description, qty, unit, unit_price, "order")
             VALUES (?,?,?,?,?,?,?,?,?)'
        );
        foreach ($items as $order => $item) {
            $itemStmt->execute([
                uuid(), $newId, $item['section'] ?? null, $item['partNumber'] ?? '',
                trim((string)$item['description']), (int)$item['qty'],
                $item['unit'] ?? 'PC', (float)$item['unitPrice'], $order,
            ]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    json_out(['id' => $newId, 'invoiceNo' => $invoiceNo], 201);
}

if ($method === 'PUT') {
    $b = body();
    require_edit_confirmation($b);
    $items = $b['items'] ?? [];
    $vatMode = strtoupper(trim((string)($b['vatMode'] ?? '')));
    $discount = (float)($b['discount'] ?? 0);
    if (!is_array($items) || count($items) === 0) json_error('Add at least one proforma item.');
    if (!in_array($vatMode, ['VAT', 'NO_VAT'], true)) json_error('Invalid VAT mode.');
    if ($discount < 0) json_error('Discount cannot be negative.');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('UPDATE proforma_invoices SET vat_mode=?, discount=? WHERE id=? AND deleted_at IS NULL');
        $stmt->execute([$vatMode, $discount, $id]);
        if ($stmt->rowCount() === 0) {
            $pdo->rollBack();
            json_error('Proforma invoice not found.', 404);
        }
        $pdo->prepare('DELETE FROM proforma_invoice_items WHERE proforma_id = ?')->execute([$id]);
        $itemStmt = $pdo->prepare(
            'INSERT INTO proforma_invoice_items
             (id, proforma_id, section, part_number, description, qty, unit, unit_price, "order")
             VALUES (?,?,?,?,?,?,?,?,?)'
        );
        $subtotal = 0;
        foreach ($items as $order => $item) {
            if (trim((string)($item['description'] ?? '')) === '') {
                throw new InvalidArgumentException('Every proforma item needs a description.');
            }
            if (!is_numeric($item['qty'] ?? null)
                || (float)$item['qty'] <= 0
                || floor((float)$item['qty']) !== (float)$item['qty']) {
                throw new InvalidArgumentException('Proforma quantity must be a whole number greater than zero.');
            }
            if (!is_numeric($item['unitPrice'] ?? null) || (float)$item['unitPrice'] < 0) {
                throw new InvalidArgumentException('Proforma price cannot be negative.');
            }
            $subtotal += (int)$item['qty'] * (float)$item['unitPrice'];
            $itemStmt->execute([
                uuid(), $id, $item['section'] ?? null, $item['partNumber'] ?? '',
                trim((string)$item['description']), (int)$item['qty'],
                $item['unit'] ?? 'PC', (float)$item['unitPrice'], $order,
            ]);
        }
        if ($discount > $subtotal) {
            throw new InvalidArgumentException('Discount cannot be greater than the subtotal.');
        }
        $pdo->commit();
    } catch (InvalidArgumentException $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        json_error($error->getMessage());
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    json_out(['ok' => true]);
}

if ($method === 'DELETE') {
    $stmt = db()->prepare('SELECT invoice_no FROM proforma_invoices WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    $reason = require_delete_confirmation($user, body());
    send_to_trash('proformaInvoice', $id, $row['invoice_no'], $user['id'], $reason);
    soft_delete('proforma_invoices', $id);
    json_out(null, 204);
}

json_error('Unknown request', 404);
