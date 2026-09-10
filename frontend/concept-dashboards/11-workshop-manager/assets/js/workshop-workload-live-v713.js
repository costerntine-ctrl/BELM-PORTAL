(function(){
  'use strict';
  const token=localStorage.getItem('belm_admin_token')||'';
  if(!token)return;

  const COLORS={green:'#1ea45a',yellow:'#e8a317',red:'#d64545'};

  async function api(){
    const r=await fetch('/api/workshop-weekly-status.php',{cache:'no-store',headers:{Authorization:'Bearer '+token}});
    const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch(_){}
    if(!r.ok)throw new Error(data&&data.error||('Request failed ('+r.status+')'));
    return data;
  }

  function findPanel(){
    return [...document.querySelectorAll('.panel')].find(p=>/Workshop Workload/i.test(p.querySelector('.panel-title')?.textContent||''));
  }

  function render(payload){
    const panel=findPanel();if(!panel)return;
    const chart=panel.querySelector('.wl-chart');const legend=panel.querySelector('.chart-legend');
    if(!chart||!legend)return;
    const days=Array.isArray(payload?.days)?payload.days:[];
    const max=Math.max(1,...days.map(d=>Math.max(Number(d.green||0),Number(d.yellow||0),Number(d.red||0))));
    const chartHeight=164;
    const barHeight=v=>Math.max(Number(v||0)>0?6:0,Math.round(Number(v||0)/max*chartHeight));
    chart.innerHTML='<div class="wl-yaxis"><span>'+max+'</span><span>'+Math.round(max*.8)+'</span><span>'+Math.round(max*.6)+'</span><span>'+Math.round(max*.4)+'</span><span>'+Math.round(max*.2)+'</span><span>0</span></div>'+
      days.map(d=>'<div class="wl-group"><div class="wl-pair" style="gap:3px">'+
        '<div class="wl-bar" title="Completed: '+Number(d.green||0)+'" style="height:'+barHeight(d.green)+'px;background:'+COLORS.green+'"></div>'+
        '<div class="wl-bar" title="Active / Within SLA: '+Number(d.yellow||0)+'" style="height:'+barHeight(d.yellow)+'px;background:'+COLORS.yellow+'"></div>'+
        '<div class="wl-bar" title="Overdue / Delayed: '+Number(d.red||0)+'" style="height:'+barHeight(d.red)+'px;background:'+COLORS.red+'"></div>'+
        '</div><span class="wl-day-label">'+String(d.day||'')+'</span></div>').join('');
    legend.innerHTML='<span><i style="background:'+COLORS.green+'"></i>Green — Completed</span><span><i style="background:'+COLORS.yellow+'"></i>Yellow — Active / Within SLA</span><span><i style="background:'+COLORS.red+'"></i>Red — Overdue / Delayed</span>';
    const link=panel.querySelector('.panel-link');if(link)link.textContent='This Week · Live';
  }

  async function load(){try{render(await api())}catch(e){console.warn('Workshop workload live status:',e)}}
  load();
  setInterval(load,60000);
})();
