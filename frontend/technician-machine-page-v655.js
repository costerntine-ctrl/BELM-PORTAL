(()=>{
  if(!location.pathname.startsWith('/tech'))return;
  const isMachinePage=()=>new URLSearchParams(location.search).get('view')==='machines';
  const style=document.createElement('style');
  style.textContent=`
    :root{--belm-tech-card-navy:#04172a;--belm-tech-panel-navy:#03162a;--belm-tech-line:#123b5f}
    body:not(.belm-tech-machines-page) #belmTechnicianMachineGrid,body:not(.belm-tech-machines-page) #belmTechnicianMachineListHeading,body:not(.belm-tech-machines-page) #belmTechMachinesPageHead{display:none!important}
    body.belm-tech-machines-page #belmTechnicianCustomerCard,body.belm-tech-machines-page #belmTechnicianMachineListHeading,body.belm-tech-machines-page .belm-technician-dashboard-shell>div:first-child{display:none!important}
    body.belm-tech-machines-page{background:#020f20!important}
    body.belm-tech-machines-page #belmTechnicianMachineGrid{display:grid!important;grid-template-columns:minmax(0,620px)!important;justify-content:center!important;opacity:1!important;visibility:visible!important;max-height:none!important;overflow:visible!important;gap:20px!important;align-items:start!important}
    body.belm-tech-machines-page #belmTechnicianMachineGrid>button:not(.belm-technician-machine-card){display:none!important}
    .belm-tech-machines-page-head{display:flex;align-items:center;gap:12px;max-width:620px;margin:0 auto 14px;padding:12px 14px;border:1px solid #17466f;border-radius:16px;background:#04172a;color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.18)}
    .belm-tech-machines-page-head a{display:grid;place-items:center;width:40px;height:40px;border:1px solid #255c89;border-radius:11px;color:#fff;text-decoration:none;font-size:21px}.belm-tech-machines-page-head b{font-size:13px;letter-spacing:.05em}.belm-tech-machines-page-head span{display:block;color:#7ea4c4;font-size:10px;margin-top:2px}
    .belm-tech-machines-loading{display:none;max-width:620px;margin:0 auto 12px;padding:14px;border:1px solid #17466f;border-radius:14px;background:#04172a;color:#9fb7cc;text-align:center;font-size:12px;font-weight:800}body.belm-tech-machines-page:not(.belm-tech-machines-ready) .belm-tech-machines-loading{display:block}

    /* V655 reference: Technician machine card follows the approved dark navy mock-up. */
    body.belm-tech-machines-page .belm-technician-machine-card.belm-tech-approved-card{
      --tech-status:#7f8da1;--tech-status-rgb:127,141,161;
      box-sizing:border-box!important;position:relative!important;width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;
      display:flex!important;flex-direction:column!important;justify-content:flex-start!important;align-items:stretch!important;gap:0!important;
      padding:26px 28px 28px!important;border:3px solid var(--tech-status)!important;border-radius:28px!important;
      overflow:visible!important;align-self:start!important;background:var(--belm-tech-card-navy)!important;color:#fff!important;
      box-shadow:0 0 0 1px rgba(var(--tech-status-rgb),.18),0 16px 42px rgba(0,0,0,.34),inset 0 0 28px rgba(4,35,63,.46)!important;
      transform:none!important;text-align:left!important;
    }
    body.belm-tech-machines-page .belm-tech-approved-card.status-red,body.belm-tech-machines-page .belm-tech-approved-card.belm-range-red{--tech-status:#ff2638;--tech-status-rgb:255,38,56}
    body.belm-tech-machines-page .belm-tech-approved-card.status-yellow,body.belm-tech-machines-page .belm-tech-approved-card.belm-range-yellow{--tech-status:#f8b600;--tech-status-rgb:248,182,0}
    body.belm-tech-machines-page .belm-tech-approved-card.status-green,body.belm-tech-machines-page .belm-tech-approved-card.belm-range-green{--tech-status:#12c24a;--tech-status-rgb:18,194,74}
    body.belm-tech-machines-page .belm-tech-approved-card>*{flex:0 0 auto!important;box-sizing:border-box!important}
    body.belm-tech-machines-page .belm-tech-approved-card::before{display:none!important}
    body.belm-tech-machines-page .belm-tech-approved-card::after{display:none!important}

    /* Header/nameplate */
    body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head{
      position:relative!important;margin:-10px 0 0!important;padding:0 184px 28px 0!important;min-height:106px!important;border:0!important;background:transparent!important;color:#fff!important;overflow:visible!important
    }
    body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head::after{
      content:""!important;position:absolute!important;left:0!important;right:0!important;bottom:12px!important;height:5px!important;border-radius:3px!important;
      background:linear-gradient(90deg,#13a8f5 0 28%,#15c74f 28% 75%,#f5b400 75% 100%)!important;opacity:1!important
    }
    body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head,body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head *{color:#fff!important}
    body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head>div:first-child>div:first-child,body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head .font-medium{
      font:900 31px/1.05 Inter,Arial,sans-serif!important;letter-spacing:-.025em!important;text-transform:none!important
    }
    body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head .text-slate-500,body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head .text-xs{
      color:#aebdce!important;font-size:13px!important;font-weight:750!important;letter-spacing:.015em!important
    }
    body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head .belm-customer-fleet-number{
      position:absolute!important;top:0!important;right:0!important;left:auto!important;width:170px!important;min-width:170px!important;max-width:170px!important;
      display:grid!important;gap:4px!important;padding:11px 13px!important;border:2px solid #0b78bd!important;border-radius:16px!important;
      background:#04162a!important;box-shadow:0 0 0 1px rgba(18,168,245,.12),0 0 22px rgba(18,168,245,.12)!important;text-align:left!important
    }
    body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head .belm-customer-fleet-number small{color:#b8c6d6!important;font-size:10px!important;font-weight:850!important;letter-spacing:.06em!important;text-transform:uppercase!important}
    body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head .belm-customer-fleet-number b{color:#fff!important;font-size:18px!important;font-weight:900!important;line-height:1.05!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-last-checked{
      margin:-2px 0 14px!important;padding:0 0 14px!important;border:0!important;border-bottom:1px solid rgba(78,125,166,.20)!important;background:transparent!important;color:#aebdce!important;
      font-size:12px!important;font-weight:760!important;letter-spacing:.025em!important;text-transform:uppercase!important;white-space:normal!important
    }

    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-info{display:flex!important;flex-direction:column!important;gap:14px!important;margin:0!important;height:auto!important;min-height:0!important;max-height:none!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-info strong,body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-info p,body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-info span,body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-info small{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}

    /* Machine status / condition */
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-health{
      order:1!important;position:relative!important;display:grid!important;grid-template-columns:minmax(150px,.72fr) minmax(0,1.65fr)!important;gap:26px!important;
      height:auto!important;min-height:132px!important;max-height:none!important;margin:0!important;padding:24px 24px 22px 22px!important;
      border:1px solid rgba(255,255,255,.82)!important;border-left:8px solid var(--tech-status)!important;border-radius:22px!important;
      background:#f5f5f4!important;color:#111827!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.55)!important
    }
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-health::before{display:none!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-health>div{min-width:0!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-health span{display:block!important;color:#273447!important;font-size:12px!important;font-weight:900!important;letter-spacing:.035em!important;text-transform:uppercase!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-health strong{display:block!important;margin-top:11px!important;color:var(--tech-status)!important;font-size:20px!important;font-weight:950!important;line-height:1.12!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-health small{display:block!important;margin-top:8px!important;color:#2f3947!important;font-size:12px!important;font-weight:650!important;line-height:1.35!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-check-stamp{order:1!important;margin:-6px 0 0!important;padding:8px 10px!important;border-radius:10px!important}

    /* Operator message + machine alert block */
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-alert-copy{
      order:2!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:16px!important;display:grid!important;gap:14px!important;
      border:1px solid #0b78bd!important;border-radius:22px!important;background:#03162a!important;box-shadow:0 0 18px rgba(11,120,189,.17)!important;overflow:visible!important
    }
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-operator-message{
      order:1!important;display:grid!important;gap:8px!important;height:auto!important;min-height:126px!important;max-height:none!important;margin:0!important;padding:22px 18px 18px!important;
      border:3px solid var(--tech-status)!important;border-radius:20px!important;background:#020f20!important;box-shadow:0 0 16px rgba(var(--tech-status-rgb),.55),inset 0 0 18px rgba(var(--tech-status-rgb),.06)!important;overflow:visible!important
    }
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-condition-message{
      order:2!important;display:grid!important;gap:8px!important;height:auto!important;min-height:96px!important;max-height:none!important;margin:0!important;padding:16px 14px!important;
      border:1px solid #17466f!important;border-radius:16px!important;background:#04172a!important;overflow:visible!important
    }
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-message-kicker{color:#17a8f4!important;font-size:11px!important;font-weight:950!important;letter-spacing:.055em!important;text-transform:uppercase!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-operator-message>strong{color:var(--tech-status)!important;font-size:17px!important;font-weight:900!important;line-height:1.25!important;overflow-wrap:anywhere!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-operator-message>small{color:#c2ccda!important;font-size:12px!important;font-weight:650!important;line-height:1.35!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-condition-message>strong{color:var(--tech-status)!important;font-size:15px!important;font-weight:900!important;line-height:1.35!important;overflow-wrap:anywhere!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-condition-message>[data-tech-service-alert-copy]{color:#c2ccda!important;font-size:12px!important;font-weight:700!important;line-height:1.3!important}

    /* Details disclosure */
    body.belm-tech-machines-page .belm-tech-approved-card .belm-machine-details-disclosure{order:3!important;margin:0!important;height:auto!important;min-height:0!important;border:1px solid #173e60!important;border-radius:16px!important;background:#04172a!important;color:#fff!important;overflow:hidden!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-machine-details-disclosure>summary{position:relative!important;display:flex!important;align-items:center!important;gap:18px!important;min-height:62px!important;padding:0 54px 0 18px!important;cursor:pointer!important;list-style:none!important;color:#fff!important;text-transform:uppercase!important;font-size:13px!important;font-weight:950!important;letter-spacing:.02em!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-machine-details-disclosure>summary::-webkit-details-marker{display:none!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-machine-details-disclosure>summary span{margin-left:auto!important;color:#a8b7c9!important;text-transform:none!important;font-size:10px!important;font-weight:700!important;letter-spacing:0!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-machine-details-disclosure>summary::after{content:"+"!important;position:absolute!important;right:18px!important;top:50%!important;transform:translateY(-52%)!important;color:#17a8f4!important;font-size:30px!important;font-weight:800!important;line-height:1!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-machine-details-disclosure[open]>summary::after{content:"−"!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-data{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;padding:0 14px 14px!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-data>div{padding:10px!important;border:1px solid #173e60!important;border-radius:10px!important;background:#03162a!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-data span{color:#7ea4c4!important;font-size:9px!important;text-transform:uppercase!important;font-weight:850!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-data b{display:block!important;margin-top:4px!important;color:#fff!important;font-size:11px!important}

    /* Activity Status */
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-op-status{order:4!important;display:grid!important;grid-template-columns:minmax(0,1fr) minmax(220px,.98fr)!important;gap:16px!important;align-items:center!important;margin:0!important;padding:16px 18px!important;height:auto!important;min-height:74px!important;border:1px solid #173e60!important;border-radius:16px!important;background:#04172a!important;color:#fff!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-op-status>div>span{display:block!important;color:#fff!important;font-size:14px!important;font-weight:950!important;letter-spacing:.02em!important;text-transform:uppercase!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-op-status>div>small{display:block!important;margin-top:6px!important;color:#a8b7c9!important;font-size:10px!important;font-weight:650!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-op-status select{width:100%!important;min-width:0!important;height:48px!important;padding:0 42px 0 14px!important;border:2px solid #17b83f!important;border-radius:12px!important;background:#03162a!important;color:#fff!important;font-size:13px!important;font-weight:850!important;box-shadow:0 0 12px rgba(23,184,63,.18)!important}

    /* Hide standalone service panel in the approved compact card; service range remains in Machine Alert. */
    body.belm-tech-machines-page .belm-tech-approved-card>.belm-technician-service-panel-v390{display:none!important}

    /* Exact approved bottom order: Report | Check Up | Service Parts | Machine Job Cards. */
    body.belm-tech-machines-page .belm-tech-approved-actions{position:static!important;inset:auto!important;transform:none!important;display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px!important;width:100%!important;height:auto!important;min-height:0!important;margin:24px 0 0!important;padding:0!important}
    body.belm-tech-machines-page .belm-tech-approved-actions>*{position:relative!important;inset:auto!important;transform:none!important;box-sizing:border-box!important;width:100%!important;min-width:0!important;height:76px!important;min-height:76px!important;margin:0!important;padding:12px 8px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;text-align:center!important;line-height:1.1!important;white-space:normal!important;border-radius:14px!important;font-size:12px!important;font-weight:900!important;box-shadow:none!important}
    body.belm-tech-machines-page .belm-tech-approved-actions>*::before{display:inline-grid!important;place-items:center!important;flex:0 0 auto!important;width:22px!important;height:22px!important;font-size:18px!important;font-weight:900!important;line-height:1!important;color:currentColor!important}
    body.belm-tech-machines-page .belm-tech-approved-actions .belm-technician-report-link{border:1px solid #173e60!important;background:#04172a!important;color:#fff!important}
    body.belm-tech-machines-page .belm-tech-approved-actions .belm-technician-report-link::before{content:"▤"!important}
    body.belm-tech-machines-page .belm-tech-approved-actions .belm-technician-checkup-button:not(.belm-technician-service-parts-button):not(.belm-technician-jobcards-button){border:1px solid #138be0!important;background:#0d8ed7!important;color:#fff!important}
    body.belm-tech-machines-page .belm-tech-approved-actions .belm-technician-checkup-button:not(.belm-technician-service-parts-button):not(.belm-technician-jobcards-button)::before{content:"▣"!important}
    body.belm-tech-machines-page .belm-tech-approved-actions .belm-technician-service-parts-button{border:1px solid #12b83f!important;background:#11b93f!important;color:#fff!important}
    body.belm-tech-machines-page .belm-tech-approved-actions .belm-technician-service-parts-button::before{content:"⚙"!important}
    body.belm-tech-machines-page .belm-tech-approved-actions .belm-technician-jobcards-button{border:1px solid #f6ad00!important;background:#f7b50a!important;color:#172033!important}
    body.belm-tech-machines-page .belm-tech-approved-actions .belm-technician-jobcards-button::before{content:"▰"!important}
    body.belm-tech-machines-page .belm-tech-approved-card.status-red .belm-technician-checkup-button:not(.belm-technician-service-parts-button):not(.belm-technician-jobcards-button)::after,body.belm-tech-machines-page .belm-tech-approved-card.status-yellow .belm-technician-checkup-button:not(.belm-technician-service-parts-button):not(.belm-technician-jobcards-button)::after{content:"!"!important;position:absolute!important;right:-5px!important;top:-11px!important;width:30px!important;height:30px!important;display:grid!important;place-items:center!important;border:2px solid #07182a!important;border-radius:50%!important;background:#f7b500!important;color:#111827!important;font-size:18px!important;font-weight:950!important;box-shadow:0 2px 8px rgba(0,0,0,.28)!important}

    @media(min-width:1320px){body.belm-tech-machines-page #belmTechnicianMachineGrid{grid-template-columns:repeat(2,minmax(0,620px))!important;max-width:1260px!important;margin:auto!important}.belm-tech-machines-page-head,.belm-tech-machines-loading{max-width:1260px}}
    @media(max-width:720px){
      body.belm-tech-machines-page #belmTechnicianMachineGrid{grid-template-columns:minmax(0,1fr)!important;gap:12px!important}.belm-tech-machines-page-head{margin-bottom:10px;padding:9px 10px}
      body.belm-tech-machines-page .belm-technician-machine-card.belm-tech-approved-card{padding:18px!important;border-width:2px!important;border-radius:22px!important}
      body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head{padding-right:128px!important;min-height:88px!important}
      body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head>div:first-child>div:first-child,body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head .font-medium{font-size:24px!important}
      body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head .belm-customer-fleet-number{width:118px!important;min-width:118px!important;max-width:118px!important;padding:8px 9px!important;border-radius:12px!important}
      body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head .belm-customer-fleet-number b{font-size:14px!important}
      body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-health{grid-template-columns:110px minmax(0,1fr)!important;gap:14px!important;min-height:112px!important;padding:18px 16px!important;border-radius:17px!important}
      body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-health strong{font-size:17px!important}body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-health small{font-size:10.5px!important}
      body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-alert-copy{padding:11px!important;gap:10px!important;border-radius:18px!important}
      body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-operator-message{min-height:104px!important;padding:16px 14px!important;border-radius:16px!important}body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-operator-message>strong{font-size:14px!important}
      body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-condition-message{min-height:82px!important;padding:13px 12px!important}body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-condition-message>strong{font-size:12.5px!important}
      body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-op-status{grid-template-columns:1fr!important;gap:10px!important;padding:14px!important}.belm-tech-approved-card .belm-technician-op-status select{height:44px!important}
      body.belm-tech-machines-page .belm-tech-approved-actions{gap:7px!important;margin-top:18px!important}body.belm-tech-machines-page .belm-tech-approved-actions>*{height:64px!important;min-height:64px!important;padding:9px 5px!important;font-size:10px!important;gap:4px!important}
    }
    @media(max-width:430px){
      body.belm-tech-machines-page .belm-technician-machine-card.belm-tech-approved-card{padding:14px!important;border-radius:18px!important}
      body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head{padding-right:0!important;padding-top:60px!important;min-height:132px!important}
      body.belm-tech-machines-page .belm-tech-approved-card>.belm-machine-native-head .belm-customer-fleet-number{top:0!important;left:0!important;right:auto!important}
      body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-health{grid-template-columns:1fr!important;gap:12px!important}
      body.belm-tech-machines-page .belm-tech-approved-card .belm-machine-details-disclosure>summary{gap:8px!important;padding-left:13px!important}body.belm-tech-machines-page .belm-tech-approved-card .belm-machine-details-disclosure>summary span{font-size:8px!important}
      body.belm-tech-machines-page .belm-tech-approved-actions{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}body.belm-tech-machines-page .belm-tech-approved-actions>*{font-size:11px!important}
    }
  `;
  document.head.appendChild(style);

  const norm=s=>(s||'').trim().replace(/\s+/g,' ').toLowerCase();
  function actionKind(el){const t=norm(el?.textContent);if(t==='report')return 1;if(t==='check up'||t==='check-up')return 2;if(t==='service parts')return 3;if(t==='machine job cards'||t==='job cards'||t==='job card')return 4;return 0}
  function prepareCard(card){
    if(!card||!card.classList.contains('belm-technician-machine-card'))return;
    card.classList.add('belm-tech-approved-card');
    const actions=[...card.querySelectorAll('button,a,[role="button"]')].filter(el=>el!==card&&actionKind(el)).sort((a,b)=>actionKind(a)-actionKind(b));
    if(actions.length){let bar=card.querySelector(':scope > .belm-tech-approved-actions');if(!bar){bar=document.createElement('div');bar.className='belm-tech-approved-actions';card.appendChild(bar)}actions.forEach(el=>bar.appendChild(el));card.appendChild(bar)}
  }
  function ensureHead(anchor){if(document.getElementById('belmTechMachinesPageHead'))return;const head=document.createElement('div');head.id='belmTechMachinesPageHead';head.className='belm-tech-machines-page-head';head.innerHTML='<a href="/tech" aria-label="Back to Technician Dashboard">←</a><div><b>MY MACHINES</b><span>Assigned machines only</span></div>';anchor?.before(head);const load=document.createElement('div');load.className='belm-tech-machines-loading';load.textContent='Loading machine cards…';head.after(load)}
  function wire(){
    const view=document.querySelector('[data-technician-view-machines]');if(view&&!view.dataset.belmDedicatedMachinePage){view.dataset.belmDedicatedMachinePage='1';view.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();location.href='/tech?view=machines'},true)}
    const grid=document.getElementById('belmTechnicianMachineGrid'),heading=document.getElementById('belmTechnicianMachineListHeading');
    if(!isMachinePage()){document.body.classList.remove('belm-tech-machines-page','belm-tech-machines-ready');return}
    document.body.classList.add('belm-tech-machines-page');
    if(grid){grid.hidden=false;grid.classList.remove('belm-technician-machine-grid-collapsed');[...grid.querySelectorAll('.belm-technician-machine-card')].forEach(prepareCard);document.body.classList.toggle('belm-tech-machines-ready',grid.querySelectorAll('.belm-technician-machine-card').length>0)}
    if(heading)ensureHead(heading);else if(grid)ensureHead(grid);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
  new MutationObserver(wire).observe(document.documentElement,{childList:true,subtree:true});
})();