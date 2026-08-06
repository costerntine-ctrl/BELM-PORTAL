<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/table_pdf_helper.php';

$user = require_auth();
require_page_access($user, 'billing');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? null;
$paymentId = $_GET['paymentId'] ?? null;

if ($method === 'GET' && $action === 'export-invoice') {
    $invoiceId = trim((string)($_GET['id'] ?? ''));
    $stmt = db()->prepare(
        'SELECT i.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         WHERE i.id = ? AND i.deleted_at IS NULL'
    );
    $stmt->execute([$invoiceId]);
    $invoice = $stmt->fetch();
    if (!$invoice) json_error('Invoice not found.', 404);

    $itemsStmt = db()->prepare('SELECT description, quantity, unit_price, line_total FROM invoice_items WHERE invoice_id = ?');
    $itemsStmt->execute([$invoiceId]);
    $items = $itemsStmt->fetchAll();

    $paymentsStmt = db()->prepare(
        "SELECT p.paid_at, p.amount, p.method, b.bank_name
         FROM payments p LEFT JOIN bank_accounts b ON b.id = p.bank_account_id
         WHERE p.invoice_id = ? ORDER BY p.paid_at ASC"
    );
    $paymentsStmt->execute([$invoiceId]);
    $payments = $paymentsStmt->fetchAll();
    $paid = array_sum(array_map(static fn($p) => (float)$p['amount'], $payments));
    $balance = (float)$invoice['total'] - $paid;

    $rows = [];
    foreach ($items as $item) {
        $rows[] = [
            $item['description'],
            'Qty: ' . $item['quantity'],
            'Unit: TZS ' . number_format((float)$item['unit_price'], 2),
            'Line total: TZS ' . number_format((float)$item['line_total'], 2),
        ];
    }
    if (count($payments)) {
        $rows[] = ['', '', '', ''];
        $rows[] = ['PAYMENTS RECEIVED', '', '', ''];
        foreach ($payments as $payment) {
            $rows[] = [
                display_date_billing((string)$payment['paid_at']),
                (string)($payment['method'] ?? '—'),
                $payment['bank_name'] ?: '—',
                'TZS ' . number_format((float)$payment['amount'], 2),
            ];
        }
    }

    output_table_pdf(
        'BELM-' . $invoice['invoice_no'] . '.pdf',
        'BELM General Tech Service Limited — Invoice ' . $invoice['invoice_no'],
        [
            'Customer: ' . $invoice['customer_name'] . ' (' . ($invoice['customer_email'] ?: '—') . ', ' . ($invoice['customer_phone'] ?: '—') . ')',
            'Due: ' . display_date_billing((string)$invoice['due_date']) . '   Status: ' . strtoupper((string)$invoice['status']),
            'Total: TZS ' . number_format((float)$invoice['total'], 2) . '   Paid: TZS ' . number_format($paid, 2) . '   Balance: TZS ' . number_format($balance, 2),
            'Generated: ' . date('d/m/Y H:i'),
        ],
        $rows
    );
}

if ($method === 'GET' && $action === 'export-invoices') {
    $stmt = db()->query(
        'SELECT i.invoice_no, i.total, i.status, i.due_date, c.name AS customer_name,
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         WHERE i.deleted_at IS NULL ORDER BY i.created_at DESC'
    );
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $balance = (float)$row['total'] - (float)$row['paid'];
        $rows[] = [
            $row['invoice_no'],
            $row['customer_name'],
            'Total: TZS ' . number_format((float)$row['total'], 2),
            'Paid: TZS ' . number_format((float)$row['paid'], 2),
            'Balance: TZS ' . number_format($balance, 2),
            'Due: ' . display_date_billing((string)$row['due_date']),
            strtoupper((string)$row['status']),
        ];
    }
    output_table_pdf(
        'BELM-invoices-' . date('Ymd-His') . '.pdf',
        'BELM General Tech Service Limited — Invoices Report',
        ['Generated: ' . date('d/m/Y H:i'), 'Total records: ' . count($rows)],
        $rows
    );
}

if ($method === 'GET' && $action === 'export-payments') {
    $stmt = db()->query(
        "SELECT p.paid_at, p.amount, p.method, i.invoice_no, c.name AS customer_name,
                b.bank_name, b.account_name
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         JOIN customers c ON c.id = i.customer_id
         LEFT JOIN bank_accounts b ON b.id = p.bank_account_id
         ORDER BY p.paid_at DESC"
    );
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $rows[] = [
            display_date_billing((string)$row['paid_at']),
            $row['invoice_no'],
            $row['customer_name'],
            'TZS ' . number_format((float)$row['amount'], 2),
            (string)($row['method'] ?? '—'),
            $row['bank_name'] ? "{$row['bank_name']} ({$row['account_name']})" : '—',
        ];
    }
    output_table_pdf(
        'BELM-payments-' . date('Ymd-His') . '.pdf',
        'BELM General Tech Service Limited — Payments Report',
        ['Generated: ' . date('d/m/Y H:i'), 'Total records: ' . count($rows)],
        $rows
    );
}

function validate_invoice_input(array $payload): array {
    $items = $payload['items'] ?? [];
    if (!is_array($items) || count($items) === 0) json_error('Add at least one invoice item.');
    $customerId = trim((string)($payload['customerId'] ?? ''));
    $machineId = trim((string)($payload['machineId'] ?? ''));
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
    $normalizedItems = [];
    $subtotal = 0.0;
    foreach ($items as $item) {
        $description = trim((string)($item['description'] ?? ''));
        $quantity = $item['quantity'] ?? null;
        $unitPrice = $item['unitPrice'] ?? null;
        if ($description === '') json_error('Every invoice item needs a description.');
        if (!is_numeric($quantity)
            || (float)$quantity <= 0
            || floor((float)$quantity) !== (float)$quantity) {
            json_error('Invoice item quantity must be a whole number greater than zero.');
        }
        if (!is_numeric($unitPrice) || (float)$unitPrice < 0) {
            json_error('Invoice item price cannot be negative.');
        }
        $lineTotal = (int)$quantity * (float)$unitPrice;
        $normalizedItems[] = [
            'description' => $description,
            'quantity' => (int)$quantity,
            'unitPrice' => (float)$unitPrice,
            'lineTotal' => $lineTotal,
        ];
        $subtotal += $lineTotal;
    }
    $tax = (float)($payload['tax'] ?? 0);
    if ($tax < 0) json_error('Tax cannot be negative.');
    $dueDate = trim((string)($payload['dueDate'] ?? ''));
    return [
        'customerId' => $customerId,
        'machineId' => $machineId !== '' ? $machineId : null,
        'dueDate' => $dueDate !== '' ? $dueDate : null,
        'items' => $normalizedItems,
        'subtotal' => $subtotal,
        'tax' => $tax,
        'total' => $subtotal + $tax,
    ];
}

function calculated_invoice_status(float $total, float $paid, ?string $dueDate): string {
    if ($total > 0 && $paid >= $total - 0.005) return 'PAID';
    if ($paid > 0) return 'PARTIALLY_PAID';
    if ($dueDate && $dueDate < date('Y-m-d')) return 'OVERDUE';
    return 'UNPAID';
}

function validated_payment_bank_id(array $payload): ?string {
    $bankAccountId = trim((string)($payload['bankAccountId'] ?? ''));
    if ($bankAccountId === '') return null;
    $stmt = db()->prepare(
        'SELECT 1 FROM bank_accounts
         WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
    );
    $stmt->execute([$bankAccountId]);
    if (!$stmt->fetch()) json_error('Selected bank account is not active.', 422);
    return $bankAccountId;
}

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
        $stmt2 = db()->prepare(
            'SELECT p.*, b.bank_name, b.account_name
             FROM payments p
             LEFT JOIN bank_accounts b ON b.id = p.bank_account_id
             WHERE p.invoice_id = ?
             ORDER BY p.paid_at DESC'
        );
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
    $invoice = validate_invoice_input($b);
    $invoiceNo = document_number('INV');
    $newId = uuid();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare("INSERT INTO invoices (id, customer_id, machine_id, invoice_no, subtotal, tax, total, status, due_date, created_at) VALUES (?,?,?,?,?,?,?,'UNPAID',?,NOW())")
            ->execute([
                $newId,
                $invoice['customerId'],
                $invoice['machineId'],
                $invoiceNo,
                $invoice['subtotal'],
                $invoice['tax'],
                $invoice['total'],
                $invoice['dueDate'],
            ]);
        $itemStmt = $pdo->prepare(
            'INSERT INTO invoice_items
             (id, invoice_id, description, quantity, unit_price, line_total)
             VALUES (?,?,?,?,?,?)'
        );
        foreach ($invoice['items'] as $item) {
            $itemStmt->execute([
                uuid(),
                $newId,
                $item['description'],
                $item['quantity'],
                $item['unitPrice'],
                $item['lineTotal'],
            ]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    json_out(['id' => $newId, 'invoiceNo' => $invoiceNo], 201);
}

if ($method === 'PUT' && !$action) {
    $b = body();
    if (($b['action'] ?? '') === 'edit') {
        require_edit_confirmation($b);
        $invoice = validate_invoice_input($b);
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'SELECT status
                 FROM invoices
                 WHERE id = ? AND deleted_at IS NULL
                 FOR UPDATE'
            );
            $stmt->execute([$id]);
            $currentStatus = $stmt->fetchColumn();
            if ($currentStatus === false) {
                $pdo->rollBack();
                json_error('Invoice not found.', 404);
            }
            $stmt = $pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id = ?');
            $stmt->execute([$id]);
            $paid = (float)$stmt->fetchColumn();
            if ($paid > $invoice['total'] + 0.005) {
                $pdo->rollBack();
                json_error('Invoice total cannot be lower than payments already recorded.', 422);
            }
            $status = $currentStatus === 'CANCELLED'
                ? 'CANCELLED'
                : calculated_invoice_status($invoice['total'], $paid, $invoice['dueDate']);
            $pdo->prepare(
                'UPDATE invoices
                 SET customer_id=?, machine_id=?, subtotal=?, tax=?, total=?,
                     status=?, due_date=?
                 WHERE id=? AND deleted_at IS NULL'
            )->execute([
                $invoice['customerId'],
                $invoice['machineId'],
                $invoice['subtotal'],
                $invoice['tax'],
                $invoice['total'],
                $status,
                $invoice['dueDate'],
                $id,
            ]);
            $pdo->prepare('DELETE FROM invoice_items WHERE invoice_id = ?')->execute([$id]);
            $itemStmt = $pdo->prepare(
                'INSERT INTO invoice_items
                 (id, invoice_id, description, quantity, unit_price, line_total)
                 VALUES (?,?,?,?,?,?)'
            );
            foreach ($invoice['items'] as $item) {
                $itemStmt->execute([
                    uuid(),
                    $id,
                    $item['description'],
                    $item['quantity'],
                    $item['unitPrice'],
                    $item['lineTotal'],
                ]);
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        json_out(['ok' => true, 'status' => $status]);
    }
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
    json_out(['ok' => true]);
}

if ($method === 'DELETE' && !$action) {
    $stmt = db()->prepare('SELECT invoice_no FROM invoices WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    $reason = require_delete_confirmation($user, body());
    send_to_trash('invoice', $id, $row['invoice_no'], $user['id'], $reason);
    soft_delete('invoices', $id);
    json_out(null, 204);
}

if ($method === 'PUT' && $action === 'payment') {
    $b = body();
    $amount = (float)($b['amount'] ?? 0);
    if ($amount <= 0) json_error('Payment amount must be greater than zero.');
    if (!$paymentId) json_error('Payment not found.', 404);
    $bankAccountId = validated_payment_bank_id($b);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'SELECT total, status, due_date
             FROM invoices
             WHERE id = ? AND deleted_at IS NULL
             FOR UPDATE'
        );
        $stmt->execute([$id]);
        $invoice = $stmt->fetch();
        if (!$invoice) {
            $pdo->rollBack();
            json_error('Invoice not found.', 404);
        }
        if ($invoice['status'] === 'CANCELLED') {
            $pdo->rollBack();
            json_error('A cancelled invoice payment cannot be edited.', 422);
        }
        $stmt = $pdo->prepare(
            'SELECT id FROM payments
             WHERE id = ? AND invoice_id = ?
             FOR UPDATE'
        );
        $stmt->execute([$paymentId, $id]);
        if (!$stmt->fetch()) {
            $pdo->rollBack();
            json_error('Payment not found for this invoice.', 404);
        }
        $stmt = $pdo->prepare(
            'SELECT COALESCE(SUM(amount),0)
             FROM payments
             WHERE invoice_id = ? AND id <> ?'
        );
        $stmt->execute([$id, $paymentId]);
        $otherPayments = (float)$stmt->fetchColumn();
        $total = (float)$invoice['total'];
        if ($otherPayments + $amount > $total + 0.005) {
            $pdo->rollBack();
            json_error('Edited payment is greater than the available invoice balance.', 422);
        }
        $pdo->prepare(
            'UPDATE payments
             SET bank_account_id=?, amount=?, method=?, reference=?
             WHERE id=? AND invoice_id=?'
        )->execute([
            $bankAccountId,
            $amount,
            trim((string)($b['method'] ?? '')) ?: null,
            trim((string)($b['reference'] ?? '')) ?: null,
            $paymentId,
            $id,
        ]);
        $paid = $otherPayments + $amount;
        $status = calculated_invoice_status($total, $paid, $invoice['due_date']);
        $pdo->prepare('UPDATE invoices SET status=? WHERE id=?')->execute([$status, $id]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    json_out(['ok' => true, 'status' => $status]);
}

if ($method === 'POST' && $action === 'payment') {
    $b = body();
    $amount = (float)($b['amount'] ?? 0);
    if ($amount <= 0) json_error('Payment amount must be greater than zero.');
    $bankAccountId = validated_payment_bank_id($b);
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
        $pdo->prepare('INSERT INTO payments (id, invoice_id, bank_account_id, amount, method, reference, paid_at) VALUES (?,?,?,?,?,?,NOW())')
            ->execute([uuid(), $id, $bankAccountId, $amount, $b['method'] ?? null, $b['reference'] ?? null]);
        $paid = $alreadyPaid + $amount;
        $status = $paid >= $total ? 'PAID' : 'PARTIALLY_PAID';
        $pdo->prepare('UPDATE invoices SET status=? WHERE id=?')->execute([$status, $id]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    json_out(['ok' => true], 201);
}

json_error('Unknown request', 404);
