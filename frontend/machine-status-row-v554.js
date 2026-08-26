(function () {
  const PATH = "/portal/dashboard";
  if (window.location.pathname !== PATH && window.location.pathname !== `${PATH}/`) return;

  const style = document.createElement("style");
  style.textContent = `
    .belm-machine-status-row-v554{
      display:grid;
      grid-template-columns:minmax(0,auto) minmax(190px,1fr);
      align-items:center;
      gap:12px;
      width:100%;
      margin:0 0 12px;
    }
    .belm-machine-status-row-v554 .belm-customer-condition-badge-v422{
      margin:0!important;
      width:max-content;
      max-width:100%;
      min-height:42px;
      display:flex;
      align-items:center;
      padding:9px 14px!important;
      white-space:nowrap;
    }
    .belm-machine-status-row-v554 .belm-customer-activity-selector{
      margin:0!important;
      padding:0!important;
      min-height:42px!important;
      border:0!important;
      background:transparent!important;
      display:block!important;
    }
    .belm-machine-status-row-v554 .belm-customer-activity-selector>div{
      display:none!important;
    }
    .belm-machine-status-row-v554 .belm-customer-activity-selector select{
      width:100%!important;
      min-height:42px!important;
      height:42px!important;
      padding:8px 36px 8px 12px!important;
      border-radius:12px!important;
      margin:0!important;
      font-size:13px!important;
      font-weight:800!important;
    }
    .belm-machine-status-row-v554 .belm-customer-activity-selector::before{
      content:"ACTIVITY STATUS";
      display:block;
      margin:0 0 4px 2px;
      color:#8fa4bb;
      font-size:9px;
      line-height:1;
      font-weight:800;
      letter-spacing:.08em;
    }
    .belm-customer-machine-info-v422{
      padding-top:0!important;
    }
    @media(max-width:560px){
      .belm-machine-status-row-v554{
        grid-template-columns:minmax(0,44%) minmax(0,56%);
        gap:8px;
      }
      .belm-machine-status-row-v554 .belm-customer-condition-badge-v422{
        width:100%;
        justify-content:center;
        padding:8px 7px!important;
        font-size:11px!important;
        white-space:normal;
        text-align:center;
      }
      .belm-machine-status-row-v554 .belm-customer-activity-selector select{
        font-size:12px!important;
      }
    }
  `;
  document.head.appendChild(style);

  function compactCard(card) {
    if (!card || card.dataset.belmStatusRowV554 === "1") return;
    const info = card.querySelector(".belm-customer-machine-info-v422");
    const badge = info?.querySelector(".belm-customer-condition-badge-v422");
    const activity = card.querySelector(".belm-customer-activity-selector[data-customer-activity-control]");
    if (!info || !badge || !activity) return;

    let row = info.querySelector(".belm-machine-status-row-v554");
    if (!row) {
      row = document.createElement("div");
      row.className = "belm-machine-status-row-v554";
      info.insertBefore(row, info.firstChild);
    }
    row.appendChild(badge);
    row.appendChild(activity);
    card.dataset.belmStatusRowV554 = "1";
  }

  function sync() {
    document.querySelectorAll(".belm-customer-machine-grid > *, [data-machine-id], .belm-machine-card").forEach(compactCard);
    document.querySelectorAll(".belm-customer-machine-info-v422").forEach((info) => compactCard(info.closest("article,section,div[class*='machine']") || info.parentElement));
  }

  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener("DOMContentLoaded", sync);
  window.addEventListener("load", sync);
  setTimeout(sync, 300);
  setTimeout(sync, 1200);
})();