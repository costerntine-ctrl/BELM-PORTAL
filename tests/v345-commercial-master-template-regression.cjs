const fs=require('fs');const path=require('path');const crypto=require('crypto');
const root=path.resolve(__dirname,'..');const r=p=>fs.readFileSync(path.join(root,p),'utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const helper=r('backend/api/commercial_master_pdf_helper.php');
const proforma=r('backend/api/proforma_pdf_helper.php');
const invoiceHelper=r('backend/api/invoice_pdf_helper.php');
const billing=r('backend/api/billing.php');
const customer=r('backend/api/customer_portal.php');
const docker=r('Dockerfile');const sw=r('frontend/belm-sw.js');const billingHtml=r('frontend/billing-manager/index.html');const health=r('backend/index.php');
const checks=[
 ['approved Proforma master exists',fs.existsSync(path.join(root,'backend/templates/BELM_DIGITAL_PROFORMA_MASTER_V2.pdf'))],
 ['approved Invoice master exists',fs.existsSync(path.join(root,'backend/templates/BELM_DIGITAL_INVOICE_MASTER_V2.pdf'))],
 ['Proforma master exact hash',sha('backend/templates/BELM_DIGITAL_PROFORMA_MASTER_V2.pdf')==='e76907fc096ba3359cf62009308c343374326a076cf5098851ecb5fcc5d5a645'],
 ['Invoice master exact hash',sha('backend/templates/BELM_DIGITAL_INVOICE_MASTER_V2.pdf')==='ee37ac1139a195ca1ae3469fc28fc1a2dfa88c79b20630692cd743beb28ca0ac'],
 ['runtime helper integrity pins both masters',helper.includes('belm_commercial_master_template_integrity')&&helper.includes('e76907fc096ba3359cf62009308c343374326a076cf5098851ecb5fcc5d5a645')&&helper.includes('ee37ac1139a195ca1ae3469fc28fc1a2dfa88c79b20630692cd743beb28ca0ac')],
 ['approved Digital Proforma layout renderer',helper.includes('DIGITAL PROFORMA')&&helper.includes('IMPORTANT NOTICE')&&helper.includes('PROFORMA / WEBSITE')],
 ['approved Digital Invoice layout renderer',helper.includes('DIGITAL INVOICE')&&helper.includes('Due Status')&&helper.includes('Job Card Ref')&&helper.includes('DOCUMENT / WEBSITE')],
 ['bank QR references are dynamic',helper.includes('REFERENCE: " . $number')&&helper.includes('belm_master_qr_vector')],
 ['approved bank accounts preserved',helper.includes('20710076849')&&helper.includes('0150761848600')],
 ['approved website preserved',helper.includes('https://portal.belmgeneraltech.co.tz/')],
 ['Proforma export routes to master renderer',proforma.includes('belm_output_commercial_master_pdf')],
 ['Invoice export routes to master renderer',invoiceHelper.includes('belm_output_commercial_master_pdf')&&billing.includes('belm_output_invoice_document_pdf($invoiceId)')],
 ['Customer downloads share same helpers',customer.includes('belm_output_invoice_document_pdf')&&customer.includes('belm_output_proforma_document_pdf')],
 ['runtime QR dependency installed',docker.includes('qrencode')],
 ['billing assets cache-busted',(billingHtml.includes('v=345-commercial-master-templates')||billingHtml.includes('v=346-commercial-number-link'))],
 ['service worker cache bumped',(sw.includes('belm-app-v345-commercial-master-templates')||sw.includes('belm-app-v346-commercial-number-link'))],
 ['health build marker bumped',(health.includes("'schemaVersion' => '345-commercial-master-templates'")||health.includes("'schemaVersion' => '346-commercial-number-link'"))],
];
let fail=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)fail++;}
if(fail)process.exit(1);console.log(`V345 checks ${checks.length}/${checks.length} passed.`);
