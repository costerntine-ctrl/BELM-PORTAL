/* Explicit per-record exports. Never adds controls to a page or exports a dashboard. */
(function(){
 'use strict';
 function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 async function download(url,token,name,printMode=false){
  const preview=printMode?window.open('','_blank'):null;
  if(printMode&&!preview)throw Error('Allow pop-ups to print this report.');
  try{
   const response=await fetch(url,{cache:'no-store',headers:{Authorization:'Bearer '+token}});
   if(!response.ok){let message='Could not prepare this report.';try{message=(await response.json()).error||message}catch(_){}throw Error(message);}
   const blob=await response.blob();
   const expected=name.toLowerCase().endsWith('.csv')?/^(text\/csv|application\/csv)/i:/application\/pdf/i;
   if(!expected.test(blob.type))throw Error('The server did not return the requested report file.');
   if(preview){const href=URL.createObjectURL(blob);preview.location.href=href;setTimeout(()=>{try{preview.focus();preview.print()}catch(_){}},1200);setTimeout(()=>URL.revokeObjectURL(href),60000);}
   else save(blob,name);
  }catch(error){preview?.close();throw error;}
 }
 function csv(data,name){
  const rows=[['Field','Value']];
  function add(value,path){
   if(value!==null&&typeof value==='object'){for(const [key,item] of Object.entries(value))add(item,path?path+'.'+key:key);return;}
   rows.push([path,typeof value==='string'&&value.startsWith('data:image/')?'[Photo]':String(value??'')]);
  }
  add(data,'');
  function cell(value){let text=String(value);if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
  save(new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),name);
 }
 window.BelmRecordFiles={download,csv};
})();
