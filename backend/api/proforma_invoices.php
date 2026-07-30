<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'billing');
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;

function compute_totals(array $items, float $discount, string $vatMode): array {
    $subtotal = array_sum(array_map(fn($i) => $i['qty'] * $i['unit_price'], $items));
    $vat = $vatMode === 'VAT' ? ($subtotal - $discount) * 0.18 : 0;
    return ['subtotal' => $subtotal, 'discount' => $discount, 'vat' => $vat, 'grandTotal' => $subtotal - $discount + $vat];
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
    send_to_trash('proformaInvoice', $id, $row['invoice_no'], $user['id']);
    soft_delete('proforma_invoices', $id);
    json_out(null, 204);
}

json_error('Unknown request', 404);
