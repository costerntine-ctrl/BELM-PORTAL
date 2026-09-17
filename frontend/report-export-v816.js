(function(){
  'use strict';
  if(window.__belmReportExport816)return;
  window.__belmReportExport816=true;

  const params=new URLSearchParams(location.search);
  const path=location.pathname.replace(/\/+$/,'')||'/';
  const reportPrefixes=['/general-report','/general-analysis','/reports-manager','/finance-report','/workshop-analysis','/technician-job-cards','/tech-checked-report','/tech-report','/customer-finance-workspace','/customer-sales-documents','/customer-petty-cash','/customer-store-audit','/customer-tools-register','/customer-procurement-workspace','/billing-manager','/bank-controller','/belm-procurement','/spare-parts-manager','/customers-manager','/admin-applications','/contracts-workshops'];
  const fromRoleReports=String(params.get('returnTo')||'').includes('/role-reports');
  const knownReport=reportPrefixes.some(prefix=>path===prefix||path.startsWith(prefix+'/'));
  const jobCardReport=(path==='/breakdown-workflow'||path.startsWith('/breakdown-workflow/'))&&(String(params.get('view')||'').toLowerCase()==='job-cards'||String(params.get('module')||'').toLowerCase()==='workshop');
  if(!fromRoleReports&&!knownReport&&!jobCardReport)return;

  const TOOLBAR_ID='belmReportExportToolbar816';
  const STYLE_ID='belmReportExportStyle816';
  const removeSelector='script,style,noscript,template,.belm-report-export-toolbar-v816,[data-no-export],.no-print,nav,aside,.sidebar,.belm-sidebar,.billing-section-sidebar,.tabs';

  function visible(el){if(!el||el.hidden||el.getAttribute('aria-hidden')==='true'||el.classList?.contains('hidden'))return false;const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'}
  function reportRoot(){
    const dialog=Array.from(document.querySelectorAll('dialog[open]')).reverse().find(d=>/(report|audit|invoice|proforma|receipt|job|statement|record)/i.test(d.id+' '+(d.querySelector('h1,h2,h3')?.textContent||'')));
    if(dialog)return dialog;
    const explicit=Array.from(document.querySelectorAll('[data-report-export]')).find(visible);
    return explicit||document.querySelector('main,.management-shell,.shell,.content,.main')||document.body;
  }
  function replaceControls(clone){clone.querySelectorAll('input,select,textarea').forEach(c=>{if(['hidden','button','submit','reset'].includes(c.type)){c.remove();return}let v='';if(c.tagName==='SELECT')v=c.options?.[c.selectedIndex]?.textContent||'';else if(c.type==='checkbox'||c.type==='radio')v=c.checked?'YES':'NO';else v=c.value||c.getAttribute('value')||'';const s=document.createElement('span');s.textContent=v;c.replaceWith(s)})}
  function cleanClone(root){const c=root.cloneNode(true);replaceControls(c);c.querySelectorAll(removeSelector).forEach(el=>el.remove());c.querySelectorAll('[hidden],.hidden,[aria-hidden="true"],dialog:not([open])').forEach(el=>el.remove());c.querySelectorAll('button').forEach(el=>el.remove());c.querySelectorAll('a[href]').forEach(a=>a.removeAttribute('href'));return c}
  function cleanText(v){return String(v??'').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim()}
  function reportTitle(root){for(const sel of ['[data-report-title]','h1','h2','.panel-head h2','.section-head h2']){const el=root.querySelector?.(sel);if(el&&cleanText(el.textContent))return cleanText(el.textContent)}return cleanText(document.title.replace(/\s+[—|-]\s+BELM.*$/i,''))||'BELM Report'}
  function slug(v){return cleanText(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'belm-report'}
  function stamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`}
  function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}

  function csvCell(v){let t=cleanText(v).replace(/\r?\n/g,' ');if(/^[=+\-@]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"'}
  function tableName(table,index){const cap=cleanText(table.querySelector('caption')?.textContent||'');if(cap)return cap;let n=table.parentElement;for(let d=0;n&&d<4;d++,n=n.parentElement){const h=n.querySelector?.('h1,h2,h3,h4,.panel-head h2,.section-head h2'),t=cleanText(h?.textContent||'');if(t)return t}return `Table ${index+1}`}
  function csvFrom(root){
    const clone=cleanClone(root),title=reportTitle(root),lines=[[csvCell('Report'),csvCell(title)].join(','),[csvCell('Generated'),csvCell(new Date().toLocaleString())].join(','),''];
    const tables=Array.from(clone.querySelectorAll('table')).filter(t=>cleanText(t.innerText));
    if(tables.length){tables.forEach((t,i)=>{lines.push(csvCell(tableName(t,i)));Array.from(t.rows).forEach(r=>{const cells=Array.from(r.cells).map(c=>csvCell(c.innerText));if(cells.length)lines.push(cells.join(','))});lines.push('')})}
    else{lines.push(csvCell('Report Data'));cleanText(clone.innerText).split('\n').map(cleanText).filter(Boolean).forEach(line=>lines.push(csvCell(line)))}
    return '\ufeff'+lines.join('\r\n');
  }

  function ascii(v){return String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,' ').replace(/[ \t]+/g,' ').trim()}
  function wrap(v,max=94){const text=ascii(v);if(!text)return [''];const out=[];let rest=text;while(rest.length>max){let cut=rest.lastIndexOf(' ',max);if(cut<Math.floor(max*.55))cut=max;out.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim()}if(rest)out.push(rest);return out}
  function pdfLines(root){const clone=cleanClone(root),title=ascii(reportTitle(root)),lines=['BELM GENERAL TECH SERVICE LIMITED',title,`Generated: ${ascii(new Date().toLocaleString())}`,''];let last='';cleanText(clone.innerText).split('\n').map(cleanText).filter(Boolean).forEach(line=>{const safe=ascii(line);if(!safe||safe===last)return;last=safe;wrap(safe).forEach(x=>lines.push(x))});return lines.slice(0,6000)}
  function pdfEscape(v){return ascii(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)'}
  function bytes(v){return new TextEncoder().encode(v).length}
  function buildPdf(lines){
    const perPage=60,pages=[];for(let i=0;i<lines.length;i+=perPage)pages.push(lines.slice(i,i+perPage));if(!pages.length)pages.push(['BELM REPORT']);
    const fontObj=3+pages.length*2,objects=[];objects[1]='<< /Type /Catalog /Pages 2 0 R >>';objects[2]=`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*2} 0 R`).join(' ')}] >>`;
    pages.forEach((page,i)=>{const po=3+i*2,co=po+1,body=['BT','/F1 9 Tf','42 800 Td','11 TL'];page.forEach(line=>body.push(`(${pdfEscape(line)}) Tj`,'T*'));body.push('ET','BT','/F1 8 Tf','42 22 Td',`(Page ${i+1} of ${pages.length}) Tj`,'ET');const stream=body.join('\n');objects[po]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${co} 0 R >>`;objects[co]=`<< /Length ${bytes(stream)} >>\nstream\n${stream}\nendstream`});
    objects[fontObj]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';let pdf='%PDF-1.4\n%BELM\n';const offsets=new Array(objects.length).fill(0);for(let i=1;i<objects.length;i++){offsets[i]=bytes(pdf);pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`}const xref=bytes(pdf);pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return new Blob([pdf],{type:'application/pdf'});
  }

  function exportCsv(){const root=reportRoot();download(new Blob([csvFrom(root)],{type:'text/csv;charset=utf-8'}),`${slug(reportTitle(root))}-${stamp()}.csv`)}
  function exportPdf(){const root=reportRoot();download(buildPdf(pdfLines(root)),`${slug(reportTitle(root))}-${stamp()}.pdf`)}
  function printReport(){const root=reportRoot(),clone=cleanClone(root),title=reportTitle(root),win=window.open('','_blank','width=1100,height=800');if(!win){window.print();return}win.document.open();win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/[<>]/g,'')}</title><style>*{box-sizing:border-box}body{margin:28px;color:#111;background:#fff;font:12px/1.45 Arial,sans-serif}h1,h2,h3{color:#07182d}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}img{max-width:100%;height:auto}.panel,.card,article,section{break-inside:avoid;margin-bottom:12px}a{color:#111;text-decoration:none}@page{size:A4;margin:12mm}</style></head><body><header><strong>BELM GENERAL TECH SERVICE LIMITED</strong><h1>${title.replace(/[<>]/g,'')}</h1><p>Generated: ${new Date().toLocaleString()}</p></header>${clone.outerHTML}</body></html>`);win.document.close();setTimeout(()=>{win.focus();win.print()},350)}

  function ensureStyle(){if(document.getElementById(STYLE_ID))return;const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`.belm-report-export-toolbar-v816{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 14px;padding:11px 12px;border:1px solid rgba(67,104,139,.28);border-left:5px solid #f2c318;border-radius:12px;background:var(--panel,var(--surface,#fff));color:var(--ink,var(--text,#172033));box-shadow:0 7px 22px rgba(8,31,52,.07)}.belm-report-export-toolbar-v816__title{display:flex;flex-direction:column;gap:2px}.belm-report-export-toolbar-v816__title b{font-size:12px;letter-spacing:.04em}.belm-report-export-toolbar-v816__title small{color:var(--muted,#68798e);font-size:10px}.belm-report-export-toolbar-v816__actions{display:flex;gap:8px;flex-wrap:wrap}.belm-report-export-toolbar-v816 button{min-height:38px;padding:8px 12px;border:1px solid #b8c7d6;border-radius:9px;font:800 11px Arial,sans-serif;cursor:pointer}.belm-report-export-toolbar-v816 button[data-export="pdf"]{background:#111827;color:#fff;border-color:#111827}.belm-report-export-toolbar-v816 button[data-export="csv"]{background:#087a43;color:#fff;border-color:#087a43}.belm-report-export-toolbar-v816 button[data-export="print"]{background:#f2c318;color:#172033;border-color:#d5ad00}[data-theme="dark"] .belm-report-export-toolbar-v816{background:#0d2033;color:#eef6ff;border-color:#314b63;border-left-color:#f2c318}@media(max-width:620px){.belm-report-export-toolbar-v816__actions,.belm-report-export-toolbar-v816 button{width:100%}.belm-report-export-toolbar-v816__actions{display:grid;grid-template-columns:1fr}.belm-report-export-toolbar-v816{align-items:stretch}}@media print{.belm-report-export-toolbar-v816{display:none!important}}`;document.head.appendChild(s)}
  function install(){if(!document.body||document.getElementById(TOOLBAR_ID))return;const target=document.querySelector('main,.management-shell,.shell,.content,.main')||document.body;if(!target)return;ensureStyle();const bar=document.createElement('section');bar.id=TOOLBAR_ID;bar.className='belm-report-export-toolbar-v816 no-print';bar.setAttribute('aria-label','Report export actions');bar.innerHTML='<div class="belm-report-export-toolbar-v816__title"><b>REPORT ACTIONS</b><small>PDF document · CSV data · Print current report</small></div><div class="belm-report-export-toolbar-v816__actions"><button type="button" data-export="pdf">PDF Download</button><button type="button" data-export="csv">CSV Download</button><button type="button" data-export="print">Print</button></div>';bar.querySelector('[data-export="pdf"]').onclick=exportPdf;bar.querySelector('[data-export="csv"]').onclick=exportCsv;bar.querySelector('[data-export="print"]').onclick=printReport;target.insertBefore(bar,target.firstChild)}
  window.BELMReportExport={pdf:exportPdf,csv:exportCsv,print:printReport,root:reportRoot};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  new MutationObserver(()=>{if(!document.getElementById(TOOLBAR_ID))install()}).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(install,500);
})();
