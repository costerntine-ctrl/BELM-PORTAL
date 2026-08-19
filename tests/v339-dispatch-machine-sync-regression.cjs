const fs=require('fs');const path=require('path');const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');let n=0;function t(name,ok){n++;if(!ok){console.error('FAIL',name);process.exitCode=1}else console.log('PASS',name)}
const js=read('frontend/breakdown-workflow/workflow.js');
const html=read('frontend/breakdown-workflow/index.html');
const api=read('backend/api/engineering.php');
const helpers=read('backend/config/helpers.php');
const sw=read('frontend/belm-sw.js');
const health=read('backend/index.php');
t('API shaping camelCases database snake_case keys',helpers.includes("preg_replace_callback")&&helpers.includes("'/_([a-z])/'")&&helpers.includes('api_shape($data)'));
t('dispatch backend returns registered machine customer relation',api.includes('SELECT m.id,m.customer_id,m.brand,m.model,m.machine_type,m.serial_number,c.name AS customer_name')&&api.includes('WHERE m.deleted_at IS NULL'));
t('dispatch machines are normalized across camelCase and snake_case',js.includes('function normalizeDispatchMachine(machine={})')&&js.includes('machine.customerId??machine.customer_id')&&js.includes('machine.machineType??machine.machine_type')&&js.includes('machine.serialNumber??machine.serial_number'));
t('dispatch option load normalizes every machine',js.includes('dispatchMachines=(data.machines||[]).map(normalizeDispatchMachine)'));
t('machine filter uses normalized customerId instead of snake_case only',js.includes("String(m.customerId??m.customer_id??'')===String(customerId)"));
t('machine labels support API-shaped fields',js.includes('m.machineType||m.machine_type')&&js.includes('m.serialNumber||m.serial_number'));
t('empty state no longer falsely claims active machine status',js.includes('No registered machines found for this customer')&&!js.includes("rows.length?'Select Machine...':'No active machines for this customer'"));
t('workflow assets cache busted to V339',html.includes('workflow.js?v=339-dispatch-machine-sync')&&html.includes('workflow.css?v=339-dispatch-machine-sync'));
t('service worker and health keep V339-or-later build identity',/const CACHE='belm-app-v(?:339-dispatch-machine-sync|340-customer-login-blue|341-proforma-invoice-direct-sync|342-technician-job-card-visibility|353-web-db-availability|354-fast-wake-loading-guard|355-json-api-clean-response|356-bank-test-reset)'/.test(sw)&&/\'schemaVersion\' => \'(?:339-dispatch-machine-sync|340-customer-login-blue|341-proforma-invoice-direct-sync|342-technician-job-card-visibility|353-web-db-availability-decoupling|354-fast-wake-loading-guard|355-json-api-clean-response|356-bank-test-reset)\'/.test(health));
if(!process.exitCode)console.log(`V339 checks passed ${n}/${n}`);
