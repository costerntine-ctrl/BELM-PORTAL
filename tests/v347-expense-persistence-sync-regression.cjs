const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..');const r=p=>fs.readFileSync(path.join(root,p),'utf8');
const api=r('backend/api/company_expenses.php'),schema=r('backend/schema.sql'),js=r('frontend/billing-manager/manager.js'),html=r('frontend/billing-manager/index.html'),css=r('frontend/billing-manager/manager.css'),backup=r('backend/api/backup.php'),sw=r('frontend/belm-sw.js'),health=r('backend/index.php');
const receiptPos=api.indexOf("=== 'receipt'");const genericGetPos=api.indexOf("if ($method === 'GET') {");
const checks=[
['company expense self-healing schema',api.includes('belm_ensure_company_expense_schema')&&api.includes('CREATE TABLE IF NOT EXISTS company_expenses')],
['company expense updated at additive',schema.includes('company_expenses ADD COLUMN IF NOT EXISTS updated_at')&&api.includes('updated_at=NOW()')],
['expense date index',schema.includes('idx_company_expenses_date')&&api.includes('idx_company_expenses_date')],
['receipt route before generic get',receiptPos>=0&&genericGetPos>=0&&receiptPos<genericGetPos],
['expense list excludes blob',api.includes("CASE WHEN NULLIF(e.receipt_photo_data,'') IS NULL")&&!api.includes("SELECT e.*, b.bank_name")],
['create returns persisted row',api.includes("'persisted' => true")&&api.includes("'storage' => 'PostgreSQL / company_expenses'")],
['recorded by fallback',api.includes("$user['name']")&&api.includes("$user['email']")],
['billing uses isolated settled loads',js.includes('Promise.allSettled')&&js.includes('one broken Billing endpoint must never make every other section')],
['expense sync error does not fake zero',js.includes('expenseSyncError ? "SYNC ERROR"')&&js.includes('EXPENSE SYNC ERROR')],
['saved expense verified after refresh',js.includes('saved permanently in PostgreSQL and verified in Billing')&&js.includes('expenses.some((item) => item.id === persistedId)')],
['expense database status visible',js.includes('✓ SAVED IN POSTGRESQL')&&js.includes('company_expenses')],
['customer expense separation explained',js.includes('Customer/Machine Procurement')&&js.includes('not mixed into BELM company P&amp;L')],
['expense count badge',html.includes('expenseCountBadge')&&css.includes('.tab-count')],
['company expenses included in backup',backup.includes("'company_expenses'")],
['billing cache V347',html.includes('v=347-expense-persistence-sync')&&sw.includes('belm-app-v347-expense-persistence-sync')],
['health V347',health.includes("'schemaVersion' => '347-expense-persistence-sync'")],
];let fail=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++;}if(fail)process.exit(1);console.log(`V347 checks ${checks.length}/${checks.length} passed.`);
