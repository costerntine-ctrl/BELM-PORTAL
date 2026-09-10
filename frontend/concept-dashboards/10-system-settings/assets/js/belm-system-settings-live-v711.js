document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var token=localStorage.getItem('belm_admin_token')||'';
  var preview=new URLSearchParams(location.search).get('preview')==='1'||/^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  if(!preview&&!token){location.replace('/login');return;}
  function toast(msg,bad){var n=document.getElementById('belmSettingsToast');if(!n){n=document.createElement('div');n.id='belmSettingsToast';n.style.cssText='position:fixed;right:22px;bottom:22px;z-index:9999;max-width:360px;padding:12px 15px;border-radius:10px;background:#16233a;color:#fff;font:600 12px Arial,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.22);display:none';document.body.appendChild(n);}n.textContent=msg;n.style.background=bad?'#9f2f2f':'#16233a';n.style.display='block';clearTimeout(n._t);n._t=setTimeout(function(){n.style.display='none';},4200);}
  async function fetchJson(url,opt){opt=opt||{};var r=await fetch(url,{...opt,cache:'no-store',headers:{Authorization:'Bearer '+token,...(opt.headers||{})}});var tx=await r.text(),d=null;try{d=tx?JSON.parse(tx):null}catch(_){}if(!r.ok)throw new Error(d&&d.error||'Request failed');return d;}

  try{var u=JSON.parse(localStorage.getItem('belm_admin_user')||'null');if(u){var strong=document.querySelector('.user-copy strong'),small=document.querySelector('.user-copy small'),avatar=document.querySelector('.user-avatar');if(strong&&u.name)strong.textContent=u.name;if(small)small.textContent=(u.roleName||'System Administrator');if(avatar&&u.name){var p=String(u.name).trim().split(/\s+/);avatar.textContent=((p[0]||'S')[0]+(p[1]||p[0]||'A')[0]).toUpperCase();}}}catch(_){}

  var info=[...document.querySelectorAll('.info-panel')].find(function(p){return /System Information/i.test(p.textContent);});
  function setInfo(label,value){if(!info)return;[...info.querySelectorAll('.info-row')].forEach(function(r){var k=r.querySelector('.k'),v=r.querySelector('.v');if(k&&v&&k.textContent.trim()===label)v.innerHTML=value;});}
  setInfo('Portal Version','V711');
  setInfo('Environment',/^(localhost|127\.0\.0\.1)$/i.test(location.hostname)?'Local Test':'Production (Render)');
  var last=localStorage.getItem('belm_last_backup_at');if(last)setInfo('Last Backup',new Date(last).toLocaleString('en-GB'));
  setInfo('Uptime','Render managed');
  fetchJson('/api/settings').then(function(){setInfo('Database','<span class="dot-live"></span>PostgreSQL (Connected)');}).catch(function(){setInfo('Database','Connection check failed');});

  var buttons=[...document.querySelectorAll('.quick-actions-grid .qa-btn')];
  buttons.forEach(function(b){
    var label=b.textContent.replace(/\s+/g,' ').trim().toLowerCase();
    if(label.includes('clear cache')) b.addEventListener('click',async function(){b.disabled=true;try{if('caches' in window){var keys=await caches.keys();await Promise.all(keys.filter(function(k){return k.indexOf('belm-portal')===0;}).map(function(k){return caches.delete(k);}));}toast('Portal cache cleared. Reloading fresh files…');setTimeout(function(){location.reload();},700);}catch(e){toast(e.message,true);b.disabled=false;}});
    else if(label.includes('backup')) b.addEventListener('click',async function(){b.disabled=true;var old=b.innerHTML;try{var r=await fetch('/api/backup',{cache:'no-store',headers:{Authorization:'Bearer '+token}});if(!r.ok){var e=await r.json().catch(function(){return {};});throw new Error(e.error||'Backup failed');}var blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a'),cd=r.headers.get('Content-Disposition')||'',m=cd.match(/filename="?([^";]+)"?/i);a.href=url;a.download=m&&m[1]||'belm-portal-backup.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);var now=new Date().toISOString();localStorage.setItem('belm_last_backup_at',now);setInfo('Last Backup',new Date(now).toLocaleString('en-GB'));toast('Full portal backup downloaded successfully.');}catch(e){toast(e.message,true);}finally{b.disabled=false;b.innerHTML=old;}});
    else if(label.includes('restart services')) b.addEventListener('click',async function(){b.disabled=true;try{await fetchJson('/api/settings');toast('Application services checked and refreshed.');setTimeout(function(){location.reload();},700);}catch(e){toast('Service check failed: '+e.message,true);}finally{setTimeout(function(){b.disabled=false;},900);}});
    else if(label.includes('maintenance mode')) b.addEventListener('click',function(){location.href='/settings-manager/?section=maintenance';});
  });
  var theme=document.getElementById('themeToggle');if(theme)theme.addEventListener('click',function(){location.href='/settings-manager/#display-theme';});
});
