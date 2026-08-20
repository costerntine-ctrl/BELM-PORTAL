const fs=require('fs');
const js=fs.readFileSync('frontend/portal-tools.js','utf8');
const css=fs.readFileSync('frontend/belm-theme.css','utf8');
const php=fs.readFileSync('backend/api/customers.php','utf8');
const checks=[
 ['View Machines',js.includes('>View Machines</button>')],
 ['BELM Workshop',js.includes('BELM Workshop')&&js.includes('/breakdown-workflow/?actor=tech')],
 ['BELM Store',js.includes('BELM Store')&&js.includes('data-tech-open-store')],
 ['General Report',js.includes('data-tech-general-report')],
 ['Expenses Rec',js.includes('Expenses Rec')&&js.includes('data-tech-expenses-rec')],
 ['Communication history',js.includes('data-tech-dashboard-communications')&&js.includes('loadTechnicianDashboardCommunications')],
 ['Five-column actions',css.includes('grid-template-columns:repeat(5,minmax(0,1fr))')],
 ['Technician assigned communication auth',php.includes("require_customer_read_access($user, $id)")],
];
for(const [n,ok] of checks){ if(!ok){console.error('FAIL',n);process.exit(1);} console.log('PASS',n); }
