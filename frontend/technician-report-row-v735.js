(()=>{
  if(!location.pathname.startsWith('/tech')||window.__belmTechnicianReportRowV735)return;
  window.__belmTechnicianReportRowV735=true;

  const style=document.createElement('style');
  style.id='belm-technician-report-row-v735';
  style.textContent=`
    /* V735: upgrade the existing Technician machine Reports modal only.
       Desktop order: Report -> From -> To -> View -> PDF -> CSV. */
    .belm-tech658-modal{width:min(1000px,96vw)!important}
    .belm-tech658-modal .machine-report-type{
      display:grid!important;
      grid-template-columns:minmax(135px,1fr) minmax(280px,auto) auto!important;
      align-items:end!important;
      gap:14px!important;
    }
    .belm-tech658-modal .machine-report-label{
      min-width:0!important;
      align-self:center!important;
    }
    .belm-tech658-modal .machine-report-period{
      display:flex!important;
      flex-wrap:nowrap!important;
      align-items:flex-end!important;
      gap:8px!important;
    }
    .belm-tech658-modal .machine-report-period label{
      min-width:132px!important;
      margin:0!important;
    }
    .belm-tech658-modal .machine-report-period input{
      width:132px!important;
      max-width:none!important;
    }
    .belm-tech658-modal .machine-report-actions{
      display:flex!important;
      flex-wrap:nowrap!important;
      align-items:flex-end!important;
      justify-content:flex-end!important;
      gap:8px!important;
    }
    .belm-tech658-modal .machine-report-actions button{
      width:auto!important;
      min-width:max-content!important;
      white-space:nowrap!important;
      margin:0!important;
    }

    @media(max-width:860px){
      .belm-tech658-modal{width:min(720px,96vw)!important}
      .belm-tech658-modal .machine-report-type{
        grid-template-columns:1fr!important;
        align-items:stretch!important;
      }
      .belm-tech658-modal .machine-report-period{
        flex-wrap:wrap!important;
      }
      .belm-tech658-modal .machine-report-actions{
        flex-wrap:wrap!important;
        justify-content:flex-start!important;
      }
    }
    @media(max-width:480px){
      .belm-tech658-modal .machine-report-period{
        display:grid!important;
        grid-template-columns:1fr 1fr!important;
      }
      .belm-tech658-modal .machine-report-period label,
      .belm-tech658-modal .machine-report-period input{width:100%!important;min-width:0!important}
      .belm-tech658-modal .machine-report-actions{
        display:grid!important;
        grid-template-columns:1fr 1fr!important;
      }
      .belm-tech658-modal .machine-report-actions button{width:100%!important;min-width:0!important}
    }
  `;
  document.head.appendChild(style);
})();
