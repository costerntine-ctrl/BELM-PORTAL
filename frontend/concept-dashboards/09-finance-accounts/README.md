# BELM Accounts Dashboard (Finance) — Template

Replica ya "Accounts Dashboard" uliyotuma, kwa role ya `finance_officer`.
Mtindo mwepesi (light theme), sawa na System Settings dashboard.

## Muundo
```
belm-finance-accounts-dashboard/
├── index.html
├── assets/
│   ├── css/belm-finance-accounts.css
│   ├── js/belm-finance-accounts.js     # saa/tarehe halisi
│   └── img/belm-logo-v2.png
```

## Vipengele
- Header + sidebar (Dashboard active, menu 12: Invoices & Proforma, Payments &
  Receipts, Expenses, Petty Cash, Bank Accounts, Customers, Suppliers, Reports,
  Financial Analysis, VAT (TRA), Audit Logs, Settings). User chip "FA / Finance
  Account / Accountant".
- Page head + "New Transaction" button.
- Kadi 4: Total Invoices, Total Payments, Outstanding, Total Expenses (na %
  delta juu/chini).
- **Income vs Expenses (Last 6 Months)** — bar chart ya SVG/CSS halisi (si
  picha), miezi 6, legend Income(kijani)/Expenses(bluu).
- **Invoice Status** — donut chart ya SVG halisi (stroke-dasharray), Paid/
  Outstanding/Overdue na asilimia.
- **Quick Actions** — buttons 6 (Create Invoice, Create Proforma, Record
  Payment, Add Expense, Petty Cash, Bank Deposit).
- **Recent Invoices** + **Recent Payments** — majedwali mawili yenye status pills.
- **Account Balances** — NMB/CRDB/Petty Cash.
- **Financial Summary (This Month)** — Income/Expenses/Net Balance.
- Footer yenye quote.

## Kuunganisha na schema ya PostgreSQL (belm-db-schema)

```sql
-- Kadi 4
SELECT count(*), sum(total_amount) FROM invoices;                              -- Total Invoices
SELECT count(*), sum(amount) FROM payments WHERE payment_date >= date_trunc('month', now()); -- Total Payments
SELECT count(*), sum(total_amount - amount_paid) FROM invoices WHERE status IN ('sent','overdue'); -- Outstanding
SELECT count(*), sum(amount) FROM expenses WHERE expense_date >= date_trunc('month', now());  -- Total Expenses

-- Income vs Expenses (miezi 6)
SELECT date_trunc('month', issue_date) AS month, sum(total_amount) AS income
FROM invoices GROUP BY 1 ORDER BY 1 DESC LIMIT 6;
SELECT date_trunc('month', expense_date) AS month, sum(amount) AS expense
FROM expenses GROUP BY 1 ORDER BY 1 DESC LIMIT 6;

-- Invoice Status donut
SELECT status, count(*) FROM invoices GROUP BY status;

-- Recent Invoices / Payments
SELECT invoice_no, c.name, issue_date, total_amount, status FROM invoices i
JOIN companies c ON c.id = i.company_id ORDER BY issue_date DESC LIMIT 5;
SELECT p.payment_date, c.name, p.amount, p.method, p.reference_no
FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN companies c ON c.id = i.company_id
ORDER BY p.payment_date DESC LIMIT 5;

-- Account Balances
SELECT bank_name, current_balance, account_no FROM bank_accounts;

-- Financial Summary
SELECT sum(total_amount) FROM invoices WHERE issue_date >= date_trunc('month', now());
SELECT sum(amount) FROM expenses WHERE expense_date >= date_trunc('month', now());
```

Chart zote mbili (bar na donut) ni SVG/CSS tuli kwa sasa — badilisha `height`
za `.bar` na `stroke-dasharray` za donut na thamani halisi kutoka kwenye query
hapo juu (JS ndogo ya kuhesabu asilimia inaweza kuongezwa kwa urahisi).
