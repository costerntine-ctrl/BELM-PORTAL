<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'bank-manager');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? null;

function finance_amount(PDO $pdo, string $sql, array $params = []): float {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return (float)$stmt->fetchColumn();
}

// Drill-down behind the "Customer Debt" card: every invoice with money
// still owed (the actual debt), plus every invoice that has been paid —
// with the receipt (if one was issued and carries a payment reference)
// shown alongside so it's obvious which payments have proof attached.
if ($method === 'GET' && $action === 'customer-debt') {
    $pdo = db();
    $stmt = $pdo->query(
        "SELECT i.id, i.invoice_no, i.total, i.due_date, i.status, i.created_at,
                c.name AS customer_name,
                COALESCE(p.paid, 0) AS paid
         FROM invoices i
         JOIN customers c ON c.id = i.customer_id
         LEFT JOIN (
           SELECT invoice_id, SUM(amount) AS paid
           FROM payments
           GROUP BY invoice_id
         ) p ON p.invoice_id = i.id
         WHERE i.deleted_at IS NULL AND i.status <> 'CANCELLED'
         ORDER BY i.created_at DESC"
    );
    $invoices = $stmt->fetchAll();

    $receiptStmt = $pdo->query(
        "SELECT invoice_id, receipt_no, payment_reference, paid_at
         FROM receipts
         WHERE deleted_at IS NULL AND invoice_id IS NOT NULL
         ORDER BY paid_at DESC"
    );
    $receiptsByInvoice = [];
    foreach ($receiptStmt->fetchAll() as $receipt) {
        $receiptsByInvoice[$receipt['invoice_id']][] = $receipt;
    }

    $owing = [];
    $settled = [];
    foreach ($invoices as $invoice) {
        $balance = max(0, (float)$invoice['total'] - (float)$invoice['paid']);
        $row = [
            'id' => $invoice['id'],
            'invoiceNo' => $invoice['invoice_no'],
            'customerName' => $invoice['customer_name'],
            'total' => (float)$invoice['total'],
            'paid' => (float)$invoice['paid'],
            'balance' => $balance,
            'dueDate' => $invoice['due_date'],
            'status' => $invoice['status'],
            'createdAt' => $invoice['created_at'],
            'receipts' => $receiptsByInvoice[$invoice['id']] ?? [],
        ];
        if ($balance > 0.005) {
            $owing[] = $row;
        } else {
            $settled[] = $row;
        }
    }

    json_out([
        'owing' => $owing,
        'settled' => $settled,
        'totalOwing' => array_sum(array_map(static fn($r) => $r['balance'], $owing)),
    ]);
}

function bank_components(PDO $pdo, string $accountId, ?string $excludeWithdrawalId = null): array {
    $opening = finance_amount(
        $pdo,
        'SELECT opening_balance
         FROM bank_accounts
         WHERE id = ? AND deleted_at IS NULL',
        [$accountId]
    );
    $payments = finance_amount(
        $pdo,
        'SELECT COALESCE(SUM(amount),0)
         FROM payments
         WHERE bank_account_id = ?',
        [$accountId]
    );
    $expenses = finance_amount(
        $pdo,
        'SELECT COALESCE(SUM(amount),0)
         FROM company_expenses
         WHERE bank_account_id = ? AND deleted_at IS NULL',
        [$accountId]
    );
    $withdrawalSql =
        'SELECT COALESCE(SUM(amount),0)
         FROM bank_withdrawals
         WHERE bank_account_id = ? AND deleted_at IS NULL';
    $withdrawalParams = [$accountId];
    if ($excludeWithdrawalId) {
        $withdrawalSql .= ' AND id <> ?';
        $withdrawalParams[] = $excludeWithdrawalId;
    }
    $withdrawals = finance_amount($pdo, $withdrawalSql, $withdrawalParams);
    return [
        'openingBalance' => $opening,
        'payments' => $payments,
        'expenses' => $expenses,
        'withdrawals' => $withdrawals,
        'balance' => $opening + $payments - $expenses - $withdrawals,
    ];
}

function require_bank_account(PDO $pdo, string $accountId, bool $lock = false): array {
    $sql =
        'SELECT *
         FROM bank_accounts
         WHERE id = ? AND deleted_at IS NULL AND is_active = 1';
    if ($lock) $sql .= ' FOR UPDATE';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$accountId]);
    $account = $stmt->fetch();
    if (!$account) json_error('Select an active bank account.', 422);
    return $account;
}

// Bank-account edits are high-impact financial changes. Require the signed-in
// BELM Admin's own password, the shared Edit PIN, and a written reason. The
// returned identity is snapshotted into the audit metadata so the history still
// says exactly who made the edit even if that user is renamed later.
function require_bank_account_edit_confirmation(array $user, array $body): array {
    $adminPassword = (string)($body['adminPassword'] ?? '');
    $reason = trim((string)($body['reason'] ?? ''));

    if ($adminPassword === '') json_error('Enter your BELM Admin password to confirm this bank account edit.');
    if ($reason === '') json_error('Enter a reason for this bank account edit.');
    if (mb_strlen($reason) > 500) json_error('Reason must be 500 characters or fewer.');

    // Reuse the portal-wide protected Edit PIN check.
    require_edit_confirmation($user, $body);

    assert_not_rate_limited('bank-account-edit-password', (string)$user['id'], 8, 15);
    $stmt = db()->prepare(
        'SELECT name, email, password_hash
         FROM users
         WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
    );
    $stmt->execute([(string)$user['id']]);
    $actor = $stmt->fetch();
    if (!$actor || !password_verify($adminPassword, (string)$actor['password_hash'])) {
        record_failed_attempt('bank-account-edit-password', (string)$user['id']);
        json_error('Incorrect BELM Admin password.', 403);
    }
    clear_rate_limit('bank-account-edit-password', (string)$user['id']);

    return [
        'reason' => $reason,
        'actorName' => trim((string)$actor['name']),
        'actorEmail' => trim((string)$actor['email']),
    ];
}

// Recent bank-account edits, with the actor snapshot and the written reason.
// This is intentionally read-only and restricted by the Bank Controller page
// permission already enforced above.
if ($method === 'GET' && $action === 'edit-audit') {
    $stmt = db()->query(
        "SELECT a.id, a.created_at, a.metadata, u.name AS current_actor_name, u.email AS current_actor_email
         FROM activity_logs a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.action = 'bank-account-edited' AND a.entity = 'bankAccount'
         ORDER BY a.created_at DESC
         LIMIT 100"
    );
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $metadata = json_decode((string)($row['metadata'] ?? ''), true);
        if (!is_array($metadata)) $metadata = [];
        $rows[] = [
            'id' => $row['id'],
            'createdAt' => $row['created_at'],
            'adminName' => $metadata['actorName'] ?? $row['current_actor_name'],
            'adminEmail' => $metadata['actorEmail'] ?? $row['current_actor_email'],
            'bankName' => $metadata['bankName'] ?? '',
            'accountName' => $metadata['accountName'] ?? '',
            'accountNumber' => $metadata['accountNumber'] ?? '',
            'reason' => $metadata['reason'] ?? '',
            'before' => $metadata['before'] ?? null,
            'after' => $metadata['after'] ?? null,
        ];
    }
    json_out([
        'systemSenderEmail' => 'info@belmgeneral.co.tz',
        'edits' => $rows,
    ]);
}

if ($method === 'GET' && $action === '') {
    $pdo = db();
    $accounts = $pdo->query(
        'SELECT *
         FROM bank_accounts
         WHERE deleted_at IS NULL
         ORDER BY bank_name, account_name'
    )->fetchAll();
    $allBankBalance = 0.0;
    foreach ($accounts as &$account) {
        $components = bank_components($pdo, $account['id']);
        $account = array_merge($account, $components);
        $allBankBalance += $components['balance'];
    }
    unset($account);

    $withdrawals = $pdo->query(
        'SELECT w.*, b.bank_name, b.account_name, b.account_number
         FROM bank_withdrawals w
         JOIN bank_accounts b ON b.id = w.bank_account_id
         WHERE w.deleted_at IS NULL
         ORDER BY w.date DESC, w.created_at DESC
         LIMIT 100'
    )->fetchAll();

    $paymentsReceived = finance_amount(
        $pdo,
        'SELECT COALESCE(SUM(amount),0) FROM payments WHERE bank_account_id IS NOT NULL'
    );
    $companyExpenses = finance_amount(
        $pdo,
        'SELECT COALESCE(SUM(amount),0)
         FROM company_expenses
         WHERE bank_account_id IS NOT NULL AND deleted_at IS NULL'
    );
    $totalWithdrawals = finance_amount(
        $pdo,
        'SELECT COALESCE(SUM(amount),0)
         FROM bank_withdrawals
         WHERE deleted_at IS NULL'
    );
    $customerDebt = finance_amount(
        $pdo,
        "SELECT COALESCE(SUM(GREATEST(i.total - COALESCE(p.paid,0),0)),0)
         FROM invoices i
         LEFT JOIN (
           SELECT invoice_id, SUM(amount) AS paid
           FROM payments
           GROUP BY invoice_id
         ) p ON p.invoice_id = i.id
         WHERE i.deleted_at IS NULL AND i.status <> 'CANCELLED'"
    );
    // VAT is government's money, not BELM's revenue — calculated as 18% of
    // every invoice's subtotal (not the free-typed "Tax" field, which
    // admins may have used loosely), so this always reflects the true
    // statutory liability regardless of what was entered per invoice.
    $vatDebt = finance_amount(
        $pdo,
        "SELECT COALESCE(SUM(ROUND(subtotal * 0.18, 2)),0)
         FROM invoices
         WHERE deleted_at IS NULL AND status <> 'CANCELLED'"
    );
    // Cost of goods sold — the purchase price BELM itself paid for the
    // spare parts on invoices, so "profit" only counts the markup, not
    // the full sale price of parts that were bought in first.
    $costOfGoodsSold = finance_amount(
        $pdo,
        "SELECT COALESCE(SUM(ii.quantity * sp.purchase_price),0)
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
         JOIN spare_parts sp ON sp.id = ii.spare_part_id
         WHERE i.deleted_at IS NULL AND i.status <> 'CANCELLED'"
    );
    $unallocatedPayments = finance_amount(
        $pdo,
        'SELECT COALESCE(SUM(amount),0)
         FROM payments
         WHERE bank_account_id IS NULL'
    );
    $unallocatedExpenses = finance_amount(
        $pdo,
        'SELECT COALESCE(SUM(amount),0)
         FROM company_expenses
         WHERE bank_account_id IS NULL AND deleted_at IS NULL'
    );
    $netAfterVat = $paymentsReceived - $companyExpenses - $totalWithdrawals - $vatDebt - $costOfGoodsSold;

    json_out([
        'accounts' => $accounts,
        'withdrawals' => $withdrawals,
        'summary' => [
            'allBankBalance' => $allBankBalance,
            'paymentsReceived' => $paymentsReceived,
            'companyExpenses' => $companyExpenses,
            'totalWithdrawals' => $totalWithdrawals,
            'customerDebt' => $customerDebt,
            'vatDebt' => $vatDebt,
            'costOfGoodsSold' => $costOfGoodsSold,
            'loss' => max(0, -$netAfterVat),
            'belmProfit' => max(0, $netAfterVat),
            'unallocatedPayments' => $unallocatedPayments,
            'unallocatedExpenses' => $unallocatedExpenses,
            'bankTestMode' => count($accounts) > 0 && count(array_filter($accounts, static fn($a) => (int)($a['is_test'] ?? 0) !== 1)) === 0,
        ],
    ]);
}

// Clear only TEST BANK allocations/withdrawals and return it to TZS 0. This
// never deletes invoices, payments, receipts, company expenses or Spare Stock.
if ($method === 'POST' && $action === 'test-reset') {
    $b = body();
    if (trim((string)($b['confirm'] ?? '')) !== 'CLEAR TEST BANK') {
        json_error('TEST BANK clear confirmation is required.', 422);
    }
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $testIds = $pdo->query("SELECT id FROM bank_accounts WHERE is_test=1 AND deleted_at IS NULL FOR UPDATE")->fetchAll(PDO::FETCH_COLUMN);
        if (!$testIds) {
            $pdo->rollBack();
            json_error('No TEST BANK account exists to clear.', 404);
        }
        $placeholders = implode(',', array_fill(0, count($testIds), '?'));
        $pdo->prepare("UPDATE payments SET bank_account_id=NULL WHERE bank_account_id IN ($placeholders)")->execute($testIds);
        $pdo->prepare("UPDATE receipts SET bank_account_id=NULL WHERE bank_account_id IN ($placeholders)")->execute($testIds);
        $pdo->prepare("UPDATE company_expenses SET bank_account_id=NULL WHERE bank_account_id IN ($placeholders)")->execute($testIds);
        $pdo->prepare("DELETE FROM bank_withdrawals WHERE bank_account_id IN ($placeholders)")->execute($testIds);
        $pdo->prepare("UPDATE bank_accounts SET opening_balance=0, is_active=1, deleted_at=NULL WHERE id IN ($placeholders) AND is_test=1")->execute($testIds);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    log_activity($user, 'test-bank-cleared', 'bankAccount', implode(',', $testIds), ['testOnly' => true]);
    json_out(['ok' => true, 'cleared' => count($testIds), 'spareStockTouched' => false]);
}

if ($method === 'POST' && $action === 'account') {
    $b = body();
    $bankName = trim((string)($b['bankName'] ?? ''));
    $accountName = trim((string)($b['accountName'] ?? ''));
    $accountNumber = trim((string)($b['accountNumber'] ?? ''));
    $openingBalance = (float)($b['openingBalance'] ?? 0);
    if ($bankName === '') json_error('Bank name is required.');
    if ($accountName === '') json_error('Account name is required.');
    if ($accountNumber === '') json_error('Account number is required.');
    if ($openingBalance < 0) json_error('Opening balance cannot be negative.');
    if ($openingBalance >= 999999999999.99) json_error('Opening balance is too large. Check the number you entered.');
    $stmt = db()->prepare(
        'SELECT 1 FROM bank_accounts
         WHERE LOWER(bank_name) = LOWER(?) AND LOWER(account_number) = LOWER(?)
           AND deleted_at IS NULL'
    );
    $stmt->execute([$bankName, $accountNumber]);
    if ($stmt->fetch()) json_error('This bank account already exists.', 409);
    $newId = uuid();
    db()->prepare(
        'INSERT INTO bank_accounts
         (id, bank_name, account_name, account_number, opening_balance, is_active, created_at)
         VALUES (?,?,?,?,?,1,NOW())'
    )->execute([$newId, $bankName, $accountName, $accountNumber, $openingBalance]);
    log_activity($user, 'bank-account-created', 'bankAccount', $newId, ['bankName' => $bankName]);
    json_out(['id' => $newId], 201);
}

if ($method === 'PUT' && $action === 'account') {
    $b = body();
    $confirmation = require_bank_account_edit_confirmation($user, $b);
    $bankName = trim((string)($b['bankName'] ?? ''));
    $accountName = trim((string)($b['accountName'] ?? ''));
    $accountNumber = trim((string)($b['accountNumber'] ?? ''));
    $openingBalance = (float)($b['openingBalance'] ?? 0);
    if ($bankName === '' || $accountName === '' || $accountNumber === '') {
        json_error('Bank name, account name and account number are required.');
    }
    if ($openingBalance < 0) json_error('Opening balance cannot be negative.');
    if ($openingBalance >= 999999999999.99) json_error('Opening balance is too large. Check the number you entered.');
    $pdo = db();
    $pdo->beginTransaction();
    $before = null;
    try {
        $before = require_bank_account($pdo, (string)$id, true);
        $stmt = $pdo->prepare(
            'SELECT 1 FROM bank_accounts
             WHERE LOWER(bank_name) = LOWER(?) AND LOWER(account_number) = LOWER(?)
               AND id <> ? AND deleted_at IS NULL'
        );
        $stmt->execute([$bankName, $accountNumber, $id]);
        if ($stmt->fetch()) {
            $pdo->rollBack();
            json_error('This bank account already exists.', 409);
        }
        $components = bank_components($pdo, (string)$id);
        $newBalance = $openingBalance + $components['payments']
            - $components['expenses'] - $components['withdrawals'];
        if ($newBalance < -0.005) {
            $pdo->rollBack();
            json_error('Opening balance would make this bank balance negative.', 422);
        }
        $stmt = $pdo->prepare(
            'UPDATE bank_accounts
             SET bank_name=?, account_name=?, account_number=?, opening_balance=?
             WHERE id=? AND deleted_at IS NULL'
        );
        $stmt->execute([$bankName, $accountName, $accountNumber, $openingBalance, $id]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    log_activity($user, 'bank-account-edited', 'bankAccount', $id, [
        'bankName' => $bankName,
        'accountName' => $accountName,
        'accountNumber' => $accountNumber,
        'reason' => $confirmation['reason'],
        'actorName' => $confirmation['actorName'],
        'actorEmail' => $confirmation['actorEmail'],
        'before' => [
            'bankName' => $before['bank_name'] ?? '',
            'accountName' => $before['account_name'] ?? '',
            'accountNumber' => $before['account_number'] ?? '',
            'openingBalance' => (float)($before['opening_balance'] ?? 0),
        ],
        'after' => [
            'bankName' => $bankName,
            'accountName' => $accountName,
            'accountNumber' => $accountNumber,
            'openingBalance' => $openingBalance,
        ],
    ]);
    json_out(['ok' => true, 'message' => 'Bank account updated and audit logged.']);
}

if (($method === 'POST' || $method === 'PUT') && $action === 'withdrawal') {
    $b = body();
    $accountId = trim((string)($b['bankAccountId'] ?? ''));
    $date = trim((string)($b['date'] ?? ''));
    $chequeNumber = trim((string)($b['chequeNumber'] ?? ''));
    $description = trim((string)($b['description'] ?? ''));
    $amount = (float)($b['amount'] ?? 0);
    $withdrawnBy = trim((string)($b['withdrawnBy'] ?? ($user['name'] ?? '')));
    if ($date === '') json_error('Withdrawal date is required.');
    if ($chequeNumber === '') json_error('Cheque or transaction number is required.');
    if ($description === '') json_error('Withdrawal reason or description is required.');
    if ($amount <= 0) json_error('Withdrawal amount must be greater than zero.');
    if ($amount >= 999999999999.99) json_error('Withdrawal amount is too large. Check the number you entered.');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        require_bank_account($pdo, $accountId, true);
        $excludeId = $method === 'PUT' ? (string)$id : null;
        if ($method === 'PUT') {
            $stmt = $pdo->prepare(
                'SELECT 1 FROM bank_withdrawals
                 WHERE id = ? AND deleted_at IS NULL
                 FOR UPDATE'
            );
            $stmt->execute([$id]);
            if (!$stmt->fetch()) {
                $pdo->rollBack();
                json_error('Withdrawal not found.', 404);
            }
        }
        $components = bank_components($pdo, $accountId, $excludeId);
        if ($amount > $components['balance'] + 0.005) {
            $pdo->rollBack();
            json_error('Withdrawal is greater than the available bank balance.', 422);
        }
        if ($method === 'POST') {
            $newId = uuid();
            $pdo->prepare(
                'INSERT INTO bank_withdrawals
                 (id, bank_account_id, date, cheque_number, description, amount, withdrawn_by, created_at)
                 VALUES (?,?,?,?,?,?,?,NOW())'
            )->execute([$newId, $accountId, $date, $chequeNumber, $description, $amount, $withdrawnBy ?: null]);
        } else {
            $pdo->prepare(
                'UPDATE bank_withdrawals
                 SET bank_account_id=?, date=?, cheque_number=?, description=?, amount=?, withdrawn_by=?
                 WHERE id=? AND deleted_at IS NULL'
            )->execute([$accountId, $date, $chequeNumber, $description, $amount, $withdrawnBy ?: null, $id]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    json_out(['ok' => true], $method === 'POST' ? 201 : 200);
}

json_error('Unknown request', 404);
