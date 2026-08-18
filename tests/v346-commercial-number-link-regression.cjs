const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const r=p=>fs.readFileSync(path.join(root,p),'utf8');
const h=r('backend/config/helpers.php');
const p=r('backend/api/proforma_invoices.php');
const b=r('backend/api/billing.php');
const s=r('backend/schema.sql');
const js=r('frontend/billing-manager/manager.js');
const css=r('frontend/billing-manager/manager.css');
const html=r('frontend/billing-manager/index.html');
const sw=r('frontend/belm-sw.js');
const health=r('backend/index.php');
const checks=[
  ['PI sequence starts at zero',h.includes('commercial_pi_number_seq_v346 MINVALUE 0 START WITH 0')&&s.includes('commercial_pi_number_seq_v346 MINVALUE 0 START WITH 0')],
  ['INV sequence starts at zero',h.includes('commercial_inv_number_seq_v346 MINVALUE 0 START WITH 0')&&s.includes('commercial_inv_number_seq_v346 MINVALUE 0 START WITH 0')],
  ['PI has seven digits',h.includes('$pad = 7')&&h.includes("$prefix = 'PI'")],
  ['INV has six digits',h.includes('$pad = 6')&&h.includes("$prefix = 'INV'")],
  ['Proforma always uses PI authority',p.includes("$invoiceNo = belm_next_commercial_number('PI');")&&!p.includes('? $sourceJobCardNo')],
  ['PI maps to INV same serial',h.includes('belm_invoice_number_from_proforma')&&h.includes("'INV-' . str_pad((string)$serial, 6")],
  ['Generate Invoice uses paired number',b.includes("belm_invoice_number_from_proforma((string)$proforma['invoice_no'])")],
  ['PI Number server lookup supported',b.includes("$b['proformaNo']")&&b.includes('UPPER(TRIM(p.invoice_no))=?')],
  ['Invoice UI has PI input',js.includes('Generate Invoice by PI Number')&&js.includes('invoiceProformaNumber')],
  ['UI previews paired INV',js.includes('invoiceNumberFromPiPreview')&&js.includes('PI-0000000 → INV-000000')],
  ['PI submit uses backend generator',js.includes('JSON.stringify({ proformaNo })')&&js.includes('/billing?action=generate-from-proforma')],
  ['pending Job Card no longer claims JC is PI',js.includes('every generated Proforma receives its own PI-0000000 format number')],
  ['dispatch separates JC from PI',r('frontend/breakdown-workflow/index.html').includes('JC Number')&&!r('frontend/breakdown-workflow/index.html').includes('JC Number / Proforma Code')],
  ['V346 UI styled',css.includes('V346 PI -> INV fixed-width numbering')],
  ['billing assets cache V346',html.includes('v=346-commercial-number-link')],
  ['service worker V346',sw.includes('belm-app-v346-commercial-number-link')],
  ['health V346',health.includes("'schemaVersion' => '346-commercial-number-link'")],
];
let f=0;
for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)f++;}
if(f)process.exit(1);
console.log(`V346 checks ${checks.length}/${checks.length} passed.`);
