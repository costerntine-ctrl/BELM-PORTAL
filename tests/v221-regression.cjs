const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
const reports=read('backend/api/reports.php');
const html=read('frontend/reports-manager/index.html');
const js=read('frontend/reports-manager/app.js');
const css=read('frontend/management-analytics.css');
const sw=read('frontend/belm-sw.js');
const checks=[
 ['period-end outstanding query',reports.includes('paid_to_date')&&reports.includes("i.created_at < (CAST(? AS DATE) + INTERVAL '1 day')")],
 ['outstanding ignores current status',!reports.includes("AND i.status IN ('UNPAID','PARTIALLY_PAID','OVERDUE')")],
 ['billing source metadata',reports.includes('Billing invoices + payments + company expenses')],
 ['finance record counts',reports.includes("'invoiceCount'")&&reports.includes("'paymentCount'")&&reports.includes("'expenseCount'")],
 ['trend excludes deleted invoices',reports.includes('JOIN invoices i ON i.id = p.invoice_id')&&reports.includes('WHERE i.deleted_at IS NULL')],
 ['sync report label',html.includes('Sync report')],
 ['sync status UI',html.includes('id="syncStatus"')&&css.includes('.sync-status')],
 ['app cache bust',html.includes('app.js?v=221-finance-sync')&&html.includes('management-analytics.css?v=221-finance-sync')],
 ['no-store report API',js.includes('cache: "no-store"')],
 ['sync timestamp display',js.includes('SYNCED · Billing invoices + payments + company expenses')],
 ['outstanding period label',js.includes('Balance as of ${data.period?.to')],
 ['focus autosync',js.includes('window.addEventListener("focus", loadReport)')],
 ['visibility autosync',js.includes('visibilitychange')],
 ['60 second autosync',js.includes('60000')],
 ['cache bumped',/CACHE='belm-app-v(\d+)-/.exec(sw) && Number(/CACHE='belm-app-v(\d+)-/.exec(sw)[1]) >= 221],
];
let bad=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)bad++;}
if(bad){console.error(`${bad} V221 checks failed`);process.exit(1)}
console.log(`${checks.length}/${checks.length} V221 checks passed`);
