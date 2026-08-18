const fs=require('fs');const path=require('path');const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');let n=0;function t(name,ok){n++;if(!ok){console.error('FAIL',name);process.exitCode=1}else console.log('PASS',name)}
const html=read('frontend/service-request-manager/index.html');
const js=read('frontend/service-request-manager/manager.js');
const api=read('backend/api/service_requests.php');
const helper=read('backend/api/table_pdf_helper.php');
const health=read('backend/index.php');
const sw=read('frontend/belm-sw.js');
t('History dialog has PDF report action',html.includes('downloadHistoryReportButton')&&html.includes('Download Report (PDF)'));
t('History download uses authenticated fetch',js.includes("action=history-pdf")&&js.includes('Authorization: `Bearer ${token || ""}`'));
t('History report downloads a PDF blob',js.includes('response.blob()')&&js.includes('link.download = filename'));
t('History endpoint is available',api.includes("$action === 'history-pdf'")&&api.includes("requestId is required."));
t('History PDF contains request summary',api.includes('SERVICE REQUEST HISTORY REPORT')&&api.includes('Assigned Technician: ')&&api.includes('Instructions: '));
t('History PDF contains notes and status timeline',api.includes("SELECT 'STATUS' AS kind")&&api.includes("SELECT 'NOTE' AS kind")&&api.includes("Date / Time  |  Event  |  By  |  Details"));
t('History PDF includes linked Job Card',api.includes('jc.job_card_no')&&api.includes("'Job Card: '"));
t('History PDF uses shared report generator',api.includes("require_once __DIR__ . '/table_pdf_helper.php';")&&api.includes('output_table_pdf(')&&helper.includes("header('Content-Type: application/pdf')"));
t('V332 assets remain cache busted on V332+',/manager\.css\?v=33[2-9]-/.test(html)&&/manager\.js\?v=33[2-9]-/.test(html));
t('Health and service worker identify V332',health.includes("'schemaVersion' => '332-service-request-history-pdf-report'")&&sw.includes("const CACHE='belm-app-v332-service-request-history-pdf-report'"));
if(!process.exitCode)console.log(`V332 checks passed ${n}/${n}`);
