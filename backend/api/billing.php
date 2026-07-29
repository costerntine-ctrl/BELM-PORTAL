<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'billing');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? null;

if ($method === 'GET' && !$action) {
    $customerId = $_GET['customerId'] ?? null;
    $status = $_GET['status'] ?? null;
    $sql = 'SELECT i.*, c.name AS customer_name FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.deleted_at IS NULL';
    $params = [];
    if ($customerId) { $sql .= ' AND i.customer_id = ?'; $params[] = $customerId; }
    if ($status) { $sql .= ' AND i.status = ?'; $params[] = $status; }
    $sql .= ' ORDER BY i.created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $invoices = $stmt->fetchAll();
    foreach ($invoices as &$inv) {
        $inv['customer'] = ['id' => $inv['customer_id'], 'name' => $inv['customer_name']];
        unset($inv['customer_name']);
        $stmt2 = db()->prepare('SELECT * FROM invoice_items WHERE invoice_id = ?');
        $stmt2->execute([$inv['id']]);
        $inv['items'] = $stmt2->fetchAll();
        $stmt2 = db()->prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at DESC');
        $stmt2->execute([$inv['id']]);
        $inv['payments'] = $stmt2->fetchAll();
        $inv['paidAmount'] = array_sum(array_map(
            static fn(array $payment): float => (float)$payment['amount'],
            $inv['payments']
        ));
        $inv['balance'] = max(0, (float)$inv['total'] - $inv['paidAmount']);
    }
    json_out($invoices);
}

if ($method === 'POST' && !$action) {
    $b = body();
    $items = $b['items'] ?? [];
    if (!is_array($items) || count($items) === 0) json_error('Add at least one invoice item.');
    $customerId = trim((string)($b['customerId'] ?? ''));
    $machineId = trim((string)($b['machineId'] ?? ''));
    $stmt = db()->prepare('SELECT 1 FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
    $stmt->execute([$customerId]);
    if (!$stmt->fetch()) json_error('Select an active customer.', 422);
    if ($machineId !== '') {
        $stmt = db()->prepare(
            'SELECT 1 FROM machines
             WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
        );
        $stmt->execute([$machineId, $customerId]);
        if (!$stmt->fetch()) json_error('Selected machine does not belong to this customer.', 422);
    }
    foreach ($items as $item) {
        if (trim((string)($item['description'] ?? '')) === '') json_error('Every invoice item needs a description.');
        if (!is_numeric($item['quantity'] ?? null)
            || (float)$item['quantity'] <= 0
            || floor((float)$item['quantity']) !== (float)$item['quantity']) {
            json_error('Invoice item quantity must be a whole number greater than zero.');
        }
        if (!is_numeric($item['unitPrice'] ?? null) || (float)$item['unitPrice'] < 0) json_error('Invoice item price cannot be negative.');
    }
    $subtotal = array_sum(array_map(fn($it) => $it['quantity'] * $it['unitPrice'], $items));
    $tax = (float)($b['tax'] ?? 0);
    if ($tax < 0) json_error('Tax cannot be negative.');
    $total = $subtotal + $tax;
    $invoiceNo = document_number('INV');
    $newId = uuid();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare("INSERT INTO invoices (id, customer_id, machine_id, invoice_no, subtotal, tax, total, status, due_date, created_at) VALUES (?,?,?,?,?,?,?,'UNPAID',?,NOW())")
            ->execute([$newId, $customerId, $machineId !== '' ? $machineId : null, $invoiceNo, $subtotal, $tax, $total, $b['dueDate'] ?? null]);
        $itemStmt = $pdo->prepare(
            'INSERT INTO invoice_items
             (id, invoice_id, description, quantity, unit_price, line_total)
             VALUES (?,?,?,?,?,?)'
        );
        foreach ($items as $item) {
            $itemStmt->execute([
                uuid(),
                $newId,
                trim((string)$item['description']),
                (int)$item['quantity'],
                (float)$item['unitPrice'],
                (float)$item['quantity'] * (float)$item['unitPrice'],
            ]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    log_activity($user['id'], 'created', 'invoice', $newId, ['invoiceNo' => $invoiceNo, 'total' => $total]);
    json_out(['id' => $newId, 'invoiceNo' => $invoiceNo], 201);
}

if ($method === 'PUT' && !$action) {
    $b = body();
    // PAID and PARTIALLY_PAID are calculated from recorded payments.
    $allowedStatuses = ['UNPAID', 'OVERDUE', 'CANCELLED'];
    $status = strtoupper(trim((string)($b['status'] ?? '')));
    if (!in_array($status, $allowedStatuses, true)) json_error('Invalid invoice status.');
    $machineId = trim((string)($b['machineId'] ?? ''));
    if ($machineId !== '') {
        $stmt = db()->prepare(
            'SELECT 1
             FROM invoices i
             JOIN machines m ON m.id = ?
             WHERE i.id = ? AND m.customer_id = i.customer_id
               AND m.deleted_at IS NULL AND i.deleted_at IS NULL'
        );
        $stmt->execute([$machineId, $id]);
        if (!$stmt->fetch()) json_error('Selected machine does not belong to the invoice customer.', 422);
    }
    $stmt = db()->prepare('UPDATE invoices SET status=?, due_date=?, machine_id=? WHERE id=? AND deleted_at IS NULL');
    $stmt->execute([$status, $b['dueDate'] ?? null, $machineId !== '' ? $machineId : null, $id]);
    if ($stmt->rowCount() === 0) json_error('Invoice not found.', 404);
    log_activity($user['id'], 'updated', 'invoice', $id, ['status' => $status]);
    json_out(['ok' => true]);
}

if ($method === 'DELETE' && !$action) {
    $stmt = db()->prepare('SELECT invoice_no FROM invoices WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    send_to_trash('invoice', $id, $row['invoice_no'], $user['id']);
    soft_delete('invoices', $id);
    log_activity($user['id'], 'deleted', 'invoice', $id, ['invoiceNo' => $row['invoice_no']]);
    json_out(null, 204);
}

if ($method === 'POST' && $action === 'payment') {
    $b = body();
    $amount = (float)($b['amount'] ?? 0);
    if ($amount <= 0) json_error('Payment amount must be greater than zero.');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT total FROM invoices WHERE id = ? AND deleted_at IS NULL FOR UPDATE');
        $stmt->execute([$id]);
        $totalValue = $stmt->fetchColumn();
        if ($totalValue === false) {
            $pdo->rollBack();
            json_error('Invoice not found.', 404);
        }
        $total = (float)$totalValue;
        $stmt = $pdo->prepare('SELECT status FROM invoices WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->fetchColumn() === 'CANCELLED') {
            $pdo->rollBack();
            json_error('A cancelled invoice cannot receive a payment.', 422);
        }
        $stmt = $pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id = ?');
        $stmt->execute([$id]);
        $alreadyPaid = (float)$stmt->fetchColumn();
        if ($alreadyPaid + $amount > $total + 0.005) {
            $pdo->rollBack();
            json_error('Payment is greater than the invoice balance.', 422);
        }
        $pdo->prepare('INSERT INTO payments (id, invoice_id, amount, method, reference, paid_at) VALUES (?,?,?,?,?,NOW())')
            ->execute([uuid(), $id, $amount, $b['method'] ?? null, $b['reference'] ?? null]);
        $paid = $alreadyPaid + $amount;
        $status = $paid >= $total ? 'PAID' : 'PARTIALLY_PAID';
        $pdo->prepare('UPDATE invoices SET status=? WHERE id=?')->execute([$status, $id]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    log_activity($user['id'], 'payment-recorded', 'invoice', $id, ['amount' => $amount]);
    json_out(['ok' => true], 201);
}

json_error('Unknown request', 404);
