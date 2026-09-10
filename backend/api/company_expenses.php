<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/table_pdf_helper.php';

$user = require_auth();
require_page_access($user, 'billing');
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;
$action = $_GET['action'] ?? '';

// Company expense records are permanent accounting data. Keep this endpoint
// self-healing so older production databases receive additive columns safely.
function belm_ensure_company_expense_schema(): void {
    static $done = false;
    if ($done) return;
    $pdo = db();
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS company_expenses (
            id VARCHAR(36) PRIMARY KEY,
            bank_account_id VARCHAR(36) NULL REFERENCES bank_accounts(id),
            date DATE NOT NULL,
            category VARCHAR(20) NOT NULL DEFAULT 'OTHER',
            description VARCHAR(500) NOT NULL,
            amount NUMERIC(12,2) NOT NULL,
            recorded_by VARCHAR(255),
            receipt_url VARCHAR(500),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NULL,
            deleted_at TIMESTAMPTZ NULL
        )"
    );
    $pdo->exec('ALTER TABLE company_expenses ADD COLUMN IF NOT EXISTS bank_account_id VARCHAR(36) NULL REFERENCES bank_accounts(id)');
    $pdo->exec('ALTER TABLE company_expenses ADD COLUMN IF NOT EXISTS receipt_photo_data TEXT NULL');
    $pdo->exec('ALTER TABLE company_expenses ADD COLUMN IF NOT EXISTS receipt_photo_mime VARCHAR(50) NULL');
    $pdo->exec('ALTER TABLE company_expenses ADD COLUMN IF NOT EXISTS receipt_photo_name VARCHAR(255) NULL');
    $pdo->exec('ALTER TABLE company_expenses ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,2) NOT NULL DEFAULT 1');
    $pdo->exec('ALTER TABLE company_expenses ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) NULL');
    $pdo->exec("ALTER TABLE company_expenses ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) NOT NULL DEFAULT 'CASH'");
    $pdo->exec('ALTER TABLE company_expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_company_expenses_bank_account ON company_expenses(bank_account_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_company_expenses_date ON company_expenses(date DESC)');
    $done = true;
}

belm_ensure_company_expense_schema();

if ($method === 'GET' && $action === 'export') {
    $stmt = db()->query(
        'SELECT e.date, e.category, e.description, e.quantity, e.unit_price, e.amount, e.payment_method, b.bank_name, b.account_name
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
            (string)($row['quantity'] ?? 1),
            'TZS ' . number_format((float)($row['unit_price'] ?? $row['amount']), 2),
            'TZS ' . number_format((float)$row['amount'], 2),
            strtoupper((string)($row['payment_method'] ?? 'CASH')),
            $row['bank_name'] ? "{$row['bank_name']} ({$row['account_name']})" : '—',
        ];
    }
    output_table_pdf(
        'BELM-expenses-' . date('Ymd-His') . '.pdf',
        'BELM General Tech Service Limited — Company Payments / Expenses Report',
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

function validated_expense_fields(array $b): array {
    $date = trim((string)($b['date'] ?? ''));
    $category = strtoupper(trim((string)($b['category'] ?? 'OTHER')));
    $description = trim((string)($b['description'] ?? ''));
    $quantity = (float)($b['quantity'] ?? 1);
    $unitPrice = array_key_exists('unitPrice', $b) ? (float)$b['unitPrice'] : 0.0;
    $amount = (float)($b['amount'] ?? 0);
    $paymentMethod = strtoupper(trim((string)($b['paymentMethod'] ?? 'CASH')));

    $allowedCategories = [
        'OIL_LUBS', 'TIRES', 'TRANSPORT', 'FUEL', 'SPARE', 'OTHERS',
        'SALARIES', 'RENT', 'UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'OTHER'
    ];
    $allowedMethods = ['CASH', 'BANK', 'MOBILE_MONEY', 'CHEQUE', 'OTHER'];

    if ($date === '') json_error('Expense date is required.');
    if (!in_array($category, $allowedCategories, true)) json_error('Invalid expense category.');
    if ($description === '') json_error('Expense description is required.');
    if ($quantity <= 0) json_error('Quantity must be greater than zero.');
    if ($unitPrice < 0) json_error('Price cannot be negative.');
    if ($amount <= 0 && $unitPrice > 0) $amount = $quantity * $unitPrice;
    if ($unitPrice <= 0 && $amount > 0) $unitPrice = $amount / $quantity;
    if ($amount <= 0) json_error('Expense amount must be greater than zero.');
    if (!in_array($paymentMethod, $allowedMethods, true)) json_error('Invalid payment method.');

    return [$date, $category, $description, $quantity, $unitPrice, $amount, $paymentMethod];
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

if ($method === 'GET') {
    $rows = db()->query(
        "SELECT e.id, e.bank_account_id, e.date, e.category, e.description,
                e.quantity, e.unit_price, e.amount, e.payment_method,
                e.recorded_by, e.receipt_url, e.created_at, e.updated_at,
                CASE WHEN NULLIF(e.receipt_photo_data,'') IS NULL THEN 0 ELSE 1 END AS has_receipt,
                b.bank_name, b.account_name
         FROM company_expenses e
         LEFT JOIN bank_accounts b ON b.id = e.bank_account_id
         WHERE e.deleted_at IS NULL
         ORDER BY e.date DESC, e.created_at DESC"
    )->fetchAll();
    foreach ($rows as &$row) $row['has_receipt'] = (int)$row['has_receipt'] === 1;
    unset($row);
    json_out($rows);
}

if ($method === 'POST') {
    $b = body();
    [$date, $category, $description, $quantity, $unitPrice, $amount, $paymentMethod] = validated_expense_fields($b);
    $bankAccountId = validated_expense_bank_id($b);
    $newId = uuid();
    $receiptPhoto = trim((string)($b['receiptPhoto'] ?? ''));
    $receiptData = $receiptMime = $receiptName = null;
    if ($receiptPhoto !== '') {
        [$receiptData, $receiptMime, $receiptName] = validate_receipt_upload($receiptPhoto, trim((string)($b['receiptName'] ?? '')));
    }
    $recordedBy = trim((string)($b['recordedBy'] ?? ''));
    if ($recordedBy === '') $recordedBy = trim((string)($user['name'] ?? $user['email'] ?? 'BELM'));
    db()->prepare('INSERT INTO company_expenses (id, bank_account_id, date, category, description, quantity, unit_price, amount, payment_method, recorded_by, receipt_url, receipt_photo_data, receipt_photo_mime, receipt_photo_name, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())')
        ->execute([$newId, $bankAccountId, $date, $category, $description, $quantity, $unitPrice, $amount, $paymentMethod, $recordedBy, $b['receiptUrl'] ?? null, $receiptData, $receiptMime, $receiptName]);
    log_activity($user, 'company-expense-created', 'companyExpense', $newId, ['amount' => $amount, 'category' => $category, 'paymentMethod' => $paymentMethod]);
    $saved = db()->prepare(
        "SELECT e.id,e.bank_account_id,e.date,e.category,e.description,e.quantity,e.unit_price,e.amount,e.payment_method,e.recorded_by,e.receipt_url,e.created_at,e.updated_at,
                CASE WHEN NULLIF(e.receipt_photo_data,'') IS NULL THEN 0 ELSE 1 END AS has_receipt,
                b.bank_name,b.account_name
         FROM company_expenses e LEFT JOIN bank_accounts b ON b.id=e.bank_account_id
         WHERE e.id=? AND e.deleted_at IS NULL"
    );
    $saved->execute([$newId]);
    $savedRow = $saved->fetch();
    if ($savedRow) $savedRow['has_receipt'] = (int)$savedRow['has_receipt'] === 1;
    json_out(['id' => $newId, 'expense' => $savedRow, 'persisted' => true, 'storage' => 'PostgreSQL / company_expenses'], 201);
}

if ($method === 'PUT') {
    $b = body();
    require_edit_confirmation($user, $b);
    [$date, $category, $description, $quantity, $unitPrice, $amount, $paymentMethod] = validated_expense_fields($b);
    $bankAccountId = validated_expense_bank_id($b);
    $recordedBy = trim((string)($b['recordedBy'] ?? ''));
    if ($recordedBy === '') $recordedBy = trim((string)($user['name'] ?? $user['email'] ?? 'BELM'));
    $receiptPhoto = trim((string)($b['receiptPhoto'] ?? ''));
    if ($receiptPhoto !== '') {
        [$receiptData, $receiptMime, $receiptName] = validate_receipt_upload($receiptPhoto, trim((string)($b['receiptName'] ?? '')));
        $stmt = db()->prepare('UPDATE company_expenses SET bank_account_id=?, date=?, category=?, description=?, quantity=?, unit_price=?, amount=?, payment_method=?, recorded_by=?, receipt_url=?, receipt_photo_data=?, receipt_photo_mime=?, receipt_photo_name=?, updated_at=NOW() WHERE id=? AND deleted_at IS NULL');
        $stmt->execute([$bankAccountId, $date, $category, $description, $quantity, $unitPrice, $amount, $paymentMethod, $recordedBy, $b['receiptUrl'] ?? null, $receiptData, $receiptMime, $receiptName, $id]);
    } else {
        $stmt = db()->prepare('UPDATE company_expenses SET bank_account_id=?, date=?, category=?, description=?, quantity=?, unit_price=?, amount=?, payment_method=?, recorded_by=?, receipt_url=?, updated_at=NOW() WHERE id=? AND deleted_at IS NULL');
        $stmt->execute([$bankAccountId, $date, $category, $description, $quantity, $unitPrice, $amount, $paymentMethod, $recordedBy, $b['receiptUrl'] ?? null, $id]);
    }
    if ($stmt->rowCount() === 0) json_error('Expense not found.', 404);
    log_activity($user, 'company-expense-edited', 'companyExpense', $id, ['amount' => $amount, 'paymentMethod' => $paymentMethod]);
    $saved = db()->prepare(
        "SELECT e.id,e.bank_account_id,e.date,e.category,e.description,e.quantity,e.unit_price,e.amount,e.payment_method,e.recorded_by,e.receipt_url,e.created_at,e.updated_at,
                CASE WHEN NULLIF(e.receipt_photo_data,'') IS NULL THEN 0 ELSE 1 END AS has_receipt,
                b.bank_name,b.account_name
         FROM company_expenses e LEFT JOIN bank_accounts b ON b.id=e.bank_account_id
         WHERE e.id=? AND e.deleted_at IS NULL"
    );
    $saved->execute([$id]);
    $savedRow = $saved->fetch();
    if ($savedRow) $savedRow['has_receipt'] = (int)$savedRow['has_receipt'] === 1;
    json_out(['ok' => true, 'expense' => $savedRow, 'persisted' => true, 'storage' => 'PostgreSQL / company_expenses']);
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
