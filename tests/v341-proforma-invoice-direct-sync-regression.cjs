const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..');const r=p=>fs.readFileSync(path.join(root,p),'utf8');
const billing=r('backend/api/billing.php'),proforma=r('backend/api/proforma_invoices.php'),bjs=r('frontend/billing-manager/manager.js'),sjs=r('frontend/spare-parts-manager/manager.js'),workflow=r('frontend/breakdown-workflow/workflow.js'),schema=r('backend/schema.sql');
const checks=[
['generate invoice from proforma API',billing.includes("generate-from-proforma")],
['invoice source proforma link',billing.includes('source_proforma_id')&&schema.includes('source_proforma_id')],
['invoice exact part number copy',billing.includes('part_number')&&schema.includes('invoice_items ADD COLUMN IF NOT EXISTS part_number')],
['invoice exact unit copy',billing.includes("$item['unit']")&&schema.includes('invoice_items ADD COLUMN IF NOT EXISTS unit')],
['copy discount and VAT',billing.includes("$totals['discount']")&&billing.includes("$totals['tax']")],
['duplicate proforma blocked',billing.includes('Invoice already exists for this Proforma')],
['generated invoice edit locked',billing.includes('commercial lines are locked')],
['proforma edit locked after invoice',proforma.includes('This Proforma already generated Invoice')],
['pending spare request endpoint',proforma.includes('pending-spare-requests')],
['request multi-link table',schema.includes('proforma_spare_request_links')],
['billing groups spare requests',bjs.includes('Pending Spare Request Proformas')&&bjs.includes('grouped into one multi-line Proforma')],
['spare manager multi-select',sjs.includes('Generate Proforma from Selected')],
['job proforma includes spares',proforma.includes('requested_spares')&&bjs.includes('job.requestedSpares')],
['invoice button lives on proforma',bjs.includes('data-generate-invoice-from-proforma')],
['new invoice starts Proforma-linked flow',bjs.includes('Invoices are generated directly from a Proforma')&&bjs.includes('invoiceProformaNumber')],
['invoice spare picker removed',!bjs.slice(bjs.indexOf('function invoiceItemRow'),bjs.indexOf('function addInvoiceItem')).includes('Pick from Spare Parts Inventory')],
['job workflow direct invoice removed',!workflow.includes('>Prepare Invoice</button>')],
];let fail=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++;}if(fail)process.exit(1);console.log(`V341 checks ${checks.length}/${checks.length} passed.`);
