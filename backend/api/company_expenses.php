<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/table_pdf_helper.php';

$user = require_auth();
require_page_access($user, 'billing');
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;
$action = $_GET['action'] ?? '';

if ($method === 'GET' && $action === 'export') {
    $stmt = db()->query(
        'SELECT e.date, e.category, e.description, e.amount, b.bank_name, b.account_name
         FROM company_expenses e
         LEFT JOIN bank_accounts b ON b.id = e.bank_account_id
         WHERE e.deleted_at IS NULL
         ORDER BY e.date DESC, e.created_at DESC'
    );
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $rows[] = [
            display_date_billing((string)$row['date']),
            strtoupper((string)$row['category']),
            (string)$row['description'],
            'TZS ' . number_format((float)$row['amount'], 2),
            $row['bank_name'] ? "{$row['bank_name']} ({$row['account_name']})" : '—',
        ];
    }
    output_table_pdf(
        'BELM-expenses-' . date('Ymd-His') . '.pdf',
        'BELM General Tech Service Limited — Company Expenses Report',
        ['Generated: ' . date('d/m/Y H:i'), 'Total records: ' . count($rows)],
        $rows
    );
}

function validated_expense_bank_id(array $payload): ?string {
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

if ($method === 'GET') {
    // receipt_photo_data is intentionally excluded here (and replaced with
    // a lightweight hasReceipt flag) — it can be large, and this list is
    // loaded on every page view; the full receipt is only fetched when
    // actually viewed/downloaded via the dedicated receipt endpoint below.
    $rows = db()->query(
        'SELECT e.*, b.bank_name, b.account_name
         FROM company_expenses e
         LEFT JOIN bank_accounts b ON b.id = e.bank_account_id
         WHERE e.deleted_at IS NULL
         ORDER BY e.date DESC, e.created_at DESC'
    )->fetchAll();
    foreach ($rows as &$row) {
        $row['hasReceipt'] = !empty($row['receipt_photo_data']);
        unset($row['receipt_photo_data']);
    }
    json_out($rows);
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
    $bankAccountId = validated_expense_bank_id($b);
    $newId = uuid();
    $receiptPhoto = trim((string)($b['receiptPhoto'] ?? ''));
    $receiptData = $receiptMime = $receiptName = null;
    if ($receiptPhoto !== '') {
        [$receiptData, $receiptMime, $receiptName] = validate_receipt_upload($receiptPhoto, trim((string)($b['receiptName'] ?? '')));
    }
    db()->prepare('INSERT INTO company_expenses (id, bank_account_id, date, category, description, amount, recorded_by, receipt_url, receipt_photo_data, receipt_photo_mime, receipt_photo_name, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())')
        ->execute([$newId, $bankAccountId, $date, $category, $description, $amount, $b['recordedBy'] ?? null, $b['receiptUrl'] ?? null, $receiptData, $receiptMime, $receiptName]);
    log_activity($user, 'company-expense-created', 'companyExpense', $newId, ['amount' => $amount, 'category' => $category]);
    json_out(['id' => $newId], 201);
}

if ($method === 'PUT') {
    $b = body();
    require_edit_confirmation($user, $b);
    $date = trim((string)($b['date'] ?? ''));
    $category = strtoupper(trim((string)($b['category'] ?? 'OTHER')));
    $description = trim((string)($b['description'] ?? ''));
    $amount = (float)($b['amount'] ?? 0);
    $allowedCategories = ['SALARIES', 'RENT', 'FUEL', 'UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'OTHER'];
    if ($date === '') json_error('Expense date is required.');
    if (!in_array($category, $allowedCategories, true)) json_error('Invalid expense category.');
    if ($description === '') json_error('Expense description is required.');
    if ($amount <= 0) json_error('Expense amount must be greater than zero.');
    $bankAccountId = validated_expense_bank_id($b);
    $receiptPhoto = trim((string)($b['receiptPhoto'] ?? ''));
    if ($receiptPhoto !== '') {
        [$receiptData, $receiptMime, $receiptName] = validate_receipt_upload($receiptPhoto, trim((string)($b['receiptName'] ?? '')));
        $stmt = db()->prepare('UPDATE company_expenses SET bank_account_id=?, date=?, category=?, description=?, amount=?, recorded_by=?, receipt_url=?, receipt_photo_data=?, receipt_photo_mime=?, receipt_photo_name=? WHERE id=? AND deleted_at IS NULL');
        $stmt->execute([$bankAccountId, $date, $category, $description, $amount, $b['recordedBy'] ?? null, $b['receiptUrl'] ?? null, $receiptData, $receiptMime, $receiptName, $id]);
    } else {
        $stmt = db()->prepare('UPDATE company_expenses SET bank_account_id=?, date=?, category=?, description=?, amount=?, recorded_by=?, receipt_url=? WHERE id=? AND deleted_at IS NULL');
        $stmt->execute([$bankAccountId, $date, $category, $description, $amount, $b['recordedBy'] ?? null, $b['receiptUrl'] ?? null, $id]);
    }
    if ($stmt->rowCount() === 0) json_error('Expense not found.', 404);
    log_activity($user, 'company-expense-edited', 'companyExpense', $id, ['amount' => $amount]);
    json_out(['ok' => true]);
}

if ($method === 'GET' && ($_GET['action'] ?? '') === 'receipt') {
    $stmt = db()->prepare(
        'SELECT receipt_photo_data, receipt_photo_mime, receipt_photo_name
         FROM company_expenses WHERE id = ? AND deleted_at IS NULL'
    );
    $stmt->execute([$id]);
    $receipt = $stmt->fetch();
    if (!$receipt || !$receipt['receipt_photo_data']) json_error('Receipt was not found.', 404);
    $binary = base64_decode((string)$receipt['receipt_photo_data'], true);
    if ($binary === false) json_error('Receipt is damaged.', 500);
    $mime = in_array(
        $receipt['receipt_photo_mime'],
        ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        true
    ) ? $receipt['receipt_photo_mime'] : 'image/jpeg';
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . strlen($binary));
    $disposition = !empty($_GET['download']) ? 'attachment' : 'inline';
    header('Content-Disposition: ' . $disposition . '; filename="' .
        preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)($receipt['receipt_photo_name'] ?: 'receipt')) .
        '"');
    echo $binary;
    exit;
}

if ($method === 'DELETE') {
    $stmt = db()->prepare('SELECT description, category FROM company_expenses WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    $reason = require_delete_confirmation($user, body());
    send_to_trash('companyExpense', $id, $row['description'] ?: $row['category'], $user['id'], $reason);
    soft_delete('company_expenses', $id);
    json_out(null, 204);
}

json_error('Unknown request', 404);
