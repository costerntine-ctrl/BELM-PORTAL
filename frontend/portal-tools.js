(function () {
  // Regression baseline: Job Cards / Process now routes Technicians to My Job Cards.
  const buttonId = "belm-applications-shortcut";
  const pathname = window.location.pathname;
  let customerExpenseMachines = null;
  let customerExpenseMachinesPromise = null;
  let customerPortalProfile = null;
  let customerPortalProfilePromise = null;
  let customerCurrentPermissions;
  let technicianReportMachines = null;
  let technicianReportMachinesPromise = null;
  let technicianCustomerProfile = null;
  let technicianCustomerProfilePromise = null;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);

  // V226 - Customer Dashboard language toggle (English / Kiswahili).
  // Default is English. Preference is stored per-browser and only affects
  // the Customer Dashboard overlay text that this file itself renders
  // (Action Required / Petty Cash / Breakdown Process / More Tools cards
  // and the renamed machines heading) - not the underlying app shell.
  const BELM_LANG_KEY = "belm_dashboard_lang";
  const belmLangDict = {
    "Machine attention": { sw: "Mashine zinazohitaji hatua" },
    "Service due": { sw: "Huduma inahitajika" },
    "Open requests": { sw: "Maombi wazi" },
    "Open": { sw: "Wazi" },
    "STATUS": { sw: "HALI" },
    "Only active issues appear here.": { sw: "Matatizo yanayoendelea pekee yanaonekana hapa." },
    "ALL MACHINES UNDER CONTROL": { sw: "MASHINE ZOTE ZIKO SALAMA" },
    "NO ACTIVE MACHINE ACTIONS": { sw: "HAKUNA HATUA INAYOHITAJIKA" },
    "No breakdown, service or open request needs action now.": { sw: "Hakuna hitilafu, huduma au ombi wazi linalohitaji hatua sasa." },
    "No machine action requires attention right now.": { sw: "Hakuna hatua ya mashine inayohitajika kwa sasa." },
    "ACTION REQUIRED": { sw: "HATUA INAHITAJIKA" },
    "Only items that need attention are shown.": { sw: "Vitu vinavyohitaji hatua pekee ndivyo vinavyoonyeshwa." },
    "MACHINES NEEDING ACTION": { sw: "MASHINE ZINAZOHITAJI HATUA" },
    "Service overdue": { sw: "Huduma imechelewa" },
    "Service due soon": { sw: "Huduma inakaribia" },
    "Service on schedule": { sw: "Huduma iko sawa" },
    "open request(s)": { sw: "ombi/maombi wazi" },
    "Machines": { sw: "Mashine" },
    "Procurement": { sw: "Manunuzi" },
    "Fuel top-up": { sw: "Mafuta yaliyowekwa" },
    "Containers handled": { sw: "Makontena yaliyoshughulikiwa" },
    "Business snapshot": { sw: "Muhtasari wa biashara" },
    "ACTION CENTER": { sw: "KITUO CHA HATUA" },
    "What needs attention now across your machines.": { sw: "Kinachohitaji hatua sasa kwenye mashine zako." },
    "PETTY CASH": { sw: "FEDHA NDOGO (PETTY CASH)" },
    "Open account": { sw: "Fungua akaunti" },
    "Used": { sw: "Zilizotumika" },
    "Top-up": { sw: "Zilizowekwa" },
    "MAINTENANCE PROCESS": { sw: "MCHAKATO WA MATENGENEZO" },
    "General Analysis": { sw: "Uchambuzi wa Jumla" },
    "Full breakdown of your fleet & activity": { sw: "Uchambuzi kamili wa mashine na shughuli zako" },
    "GENERAL ANALYSIS": { sw: "UCHAMBUZI WA JUMLA" },
    "UPDATE": { sw: "TAARIFA MPYA" },
    "BELM, Technician & machine activity": { sw: "Taarifa za BELM, Fundi, na shughuli za mashine" },
    "UPDATES": { sw: "TAARIFA MPYA" },
    "Latest messages from BELM, Technician daily activity, and machine activity — all in one place.": { sw: "Ujumbe wa hivi karibuni kutoka BELM, shughuli za kila siku za Fundi, na shughuli za mashine — mahali pamoja." },
    "FROM BELM": { sw: "KUTOKA BELM" },
    "No messages from BELM yet.": { sw: "Hakuna ujumbe kutoka BELM bado." },
    "FROM TECHNICIAN (DAILY ACTIVITY)": { sw: "KUTOKA FUNDI (SHUGHULI ZA KILA SIKU)" },
    "No checkup activity recorded yet.": { sw: "Hakuna shughuli ya ukaguzi iliyorekodiwa bado." },
    "CHECKUP ACTIVITY — LAST 7 DAYS": { sw: "SHUGHULI ZA UKAGUZI — SIKU 7 ZILIZOPITA" },
    "Filled by": { sw: "Ilijazwa na" },
    "Loading updates…": { sw: "Inapakia taarifa…" },
    "Could not load updates.": { sw: "Imeshindwa kupakia taarifa." },
    "Full breakdown of your machines and account activity.": { sw: "Uchambuzi kamili wa mashine zako na shughuli za akaunti." },
    "Loading analysis…": { sw: "Inapakia uchambuzi…" },
    "Could not load analysis.": { sw: "Imeshindwa kupakia uchambuzi." },
    "Close": { sw: "Funga" },
    "FLEET OVERVIEW": { sw: "MUHTASARI WA MASHINE" },
    "Total machines": { sw: "Jumla ya mashine" },
    "Green": { sw: "Salama (Green)" },
    "Yellow": { sw: "Onyo (Yellow)" },
    "Red": { sw: "Hatari (Red)" },
    "Due for service": { sw: "Zinazohitaji huduma" },
    "FINANCIALS": { sw: "FEDHA" },
    "Procurement total": { sw: "Jumla ya manunuzi" },
    "Fuel cost total": { sw: "Jumla ya gharama za mafuta" },
    "Petty Cash topped up": { sw: "Petty Cash iliyowekwa" },
    "Petty Cash used": { sw: "Petty Cash iliyotumika" },
    "Petty Cash balance": { sw: "Salio la Petty Cash" },
    "Invoices total": { sw: "Jumla ya ankara" },
    "Invoices outstanding": { sw: "Ankara zisizolipwa" },
    "SERVICE & SUPPORT": { sw: "HUDUMA NA MSAADA" },
    "Total service requests": { sw: "Jumla ya maombi ya huduma" },
    "Open service requests": { sw: "Maombi wazi ya huduma" },
    "Checklist reports": { sw: "Ripoti za ukaguzi" },
    "Containers handled": { sw: "Makontena yaliyoshughulikiwa" },
    "PER-MACHINE BREAKDOWN": { sw: "UCHAMBUZI WA KILA MASHINE" },
    "Machine": { sw: "Mashine" },
    "Status": { sw: "Hali" },
    "Requests": { sw: "Maombi" },
    "Reports": { sw: "Ripoti" },
    "Procurement & receipt photos": { sw: "Procurement na picha za risiti" },
    "Service level": { sw: "Kiwango cha huduma" },
    "No machines registered yet.": { sw: "Hakuna mashine zilizosajiliwa bado." },
    "Live delays, approvals & Job Cards": { sw: "Ucheleweshaji, idhini na Job Card - moja kwa moja" },
    "MORE TOOLS": { sw: "ZANA ZAIDI" },
    "+USER": { sw: "+MTUMIAJI" },
    "Role Manager & Dashboard Access": { sw: "Meneja wa Majukumu na Ufikiaji wa Dashibodi" },
    "Privacy & BELM Access": { sw: "Faragha na Ufikiaji wa BELM" },
    "Choose what internal company data BELM may access": { sw: "Chagua data za ndani za kampuni ambazo BELM anaweza kuona" },
    "PRIVACY & BELM ACCESS": { sw: "FARAGHA NA UFIKIAJI WA BELM" },
    "Customer-controlled data sharing": { sw: "Ushirikishaji wa data unaodhibitiwa na mteja" },
    "Check-up & maintenance records": { sw: "Rekodi za ukaguzi na matengenezo" },
    "Expenses & receipt photos": { sw: "Matumizi na picha za risiti" },
    "Store & service-parts records": { sw: "Rekodi za ghala na spare za service" },
    "Customer team/user directory": { sw: "Orodha ya timu/watumiaji wa mteja" },
    "Save privacy": { sw: "Hifadhi faragha" },
    "Privacy settings saved.": { sw: "Mipangilio ya faragha imehifadhiwa." },
    "Always shared with BELM": { sw: "Data inayoshirikishwa na BELM kila wakati" },
    "Basic company/machine identity, official support requests, and direct BELM communications remain available.": { sw: "Taarifa za msingi za kampuni/mashine, maombi rasmi ya msaada, na mawasiliano ya moja kwa moja na BELM hubaki yakipatikana." },
    "Service Provider exception": { sw: "Isipokuwa ya Service Provider" },
    "When BELM Service Provider is ON, maintenance/check-up and service-kit data needed to perform the service remains accessible. An open official support request also grants temporary access for that machine.": { sw: "BELM Service Provider akiwa ON, data za matengenezo/ukaguzi na service-kit zinazohitajika kufanya huduma hubaki zikionekana. Ombi rasmi la msaada lililo wazi pia hutoa ufikiaji wa muda kwa mashine hiyo." },
    "Open Privacy Policy": { sw: "Fungua Sera ya Faragha" },
    "Request BELM Support": { sw: "Omba Msaada wa BELM" },
    "Management Email": { sw: "Barua pepe ya Uongozi" },
    "Loading operating mode…": { sw: "Inapakia hali ya uendeshaji…" },
    "CUSTOMER MAINTENANCE TEAM": { sw: "TIMU YA MATENGENEZO YA MTEJA" },
    "Your Technicians manage maintenance. BELM Support remains available when assistance is needed.": { sw: "Mafundi wako ndio wanaosimamia matengenezo. Msaada wa BELM upo endapo utahitajika." },
    "BELM SERVICE PROVIDER ACTIVE": { sw: "MTOA HUDUMA BELM ANAFANYA KAZI" },
    "Machine problems and maintenance route to BELM. Your Fuel, Operators, Workshop, Store, Procurement, Accounts and other portal functions remain under your company; only the Customer Technician role is paused.": { sw: "Matatizo na matengenezo ya mashine yanaelekezwa BELM. Mafuta, Waendeshaji, Karakana, Ghala, Ununuzi, Hesabu na sehemu nyingine za mfumo zinabaki chini ya kampuni yako; ni jukumu la Fundi wa Mteja pekee lililosimamishwa." },
    "MACHINES": { sw: "MASHINE" },
  };
  const belmLang = () => (localStorage.getItem(BELM_LANG_KEY) === "sw" ? "sw" : "en");
  const belmT = (text) => {
    if (belmLang() !== "sw") return text;
    return belmLangDict[text]?.sw ?? text;
  };
  const belmSetLang = (lang) => {
    localStorage.setItem(BELM_LANG_KEY, lang === "sw" ? "sw" : "en");
    window.location.reload();
  };
  function insertCustomerLangToggle() {
    if (window.location.pathname !== "/portal/dashboard") return;
    if (document.getElementById("belmLangToggle")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "belmLangToggle";
    btn.className = "belm-lang-toggle";
    const current = belmLang();
    btn.textContent = current === "sw" ? "🌐 Kiswahili" : "🌐 English";
    btn.title = "Switch dashboard language / Badilisha lugha ya dashibodi";
    btn.addEventListener("click", () => belmSetLang(current === "sw" ? "en" : "sw"));
    document.body.appendChild(btn);
  }

  // V234 - General Analysis dialog: reuses /api/customer-portal/analysis
  // (the same data that powers the dashboard's Action Center card) but
  // presents it as a full, organized breakdown across Fleet, Financials,
  // Service & Support, and a per-machine table - opened from MORE TOOLS.
  function closeCustomerGeneralAnalysisDialog() {
    document.getElementById("belmGeneralAnalysisDialog")?.remove();
  }
  async function openCustomerGeneralAnalysisDialog() {
    closeCustomerGeneralAnalysisDialog();
    const dialog = document.createElement("dialog");
    dialog.id = "belmGeneralAnalysisDialog";
    dialog.className = "belm-general-analysis-dialog";
    dialog.innerHTML = `
      <div class="belm-general-analysis-head">
        <div><h2>${belmT("GENERAL ANALYSIS")}</h2><p>${belmT("Full breakdown of your machines and account activity.")}</p></div>
        <button type="button" data-close-general-analysis>${belmT("Close")}</button>
      </div>
      <div class="belm-general-analysis-body" id="belmGeneralAnalysisBody">
        <p class="belm-general-analysis-loading">${belmT("Loading analysis…")}</p>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector("[data-close-general-analysis]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();

    const body = dialog.querySelector("#belmGeneralAnalysisBody");
    try {
      const token = localStorage.getItem("belm_customer_token");
      const response = await fetch("/api/customer-portal/analysis", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const m = data.machines || {};
      const pc = data.pettyCashAccount || {};
      const inv = data.invoices || {};
      const sr = data.serviceRequests || {};
      const tzs = (v) => `TZS ${Number(v || 0).toLocaleString("en-TZ", { maximumFractionDigits: 2 })}`;
      const perMachine = data.perMachine || [];
      body.innerHTML = `
        <section class="belm-analysis-section">
          <h3>${belmT("FLEET OVERVIEW")}</h3>
          <div class="belm-analysis-grid">
            <div><span>${belmT("Total machines")}</span><b>${m.total ?? 0}</b></div>
            <div><span>${belmT("Green")}</span><b class="green">${m.green ?? 0}</b></div>
            <div><span>${belmT("Yellow")}</span><b class="yellow">${m.yellow ?? 0}</b></div>
            <div><span>${belmT("Red")}</span><b class="red">${m.red ?? 0}</b></div>
            <div><span>${belmT("Due for service")}</span><b>${data.dueForServiceCount ?? 0}</b></div>
          </div>
        </section>
        <section class="belm-analysis-section">
          <h3>${belmT("FINANCIALS")}</h3>
          <div class="belm-analysis-grid">
            <div><span>${belmT("Procurement total")}</span><b>${tzs(data.machineExpensesTotal)}</b></div>
            <div><span>${belmT("Fuel cost total")}</span><b>${tzs(data.fuelCostTotal)}</b></div>
            <div><span>${belmT("Petty Cash topped up")}</span><b>${tzs(pc.totalToppedUp)}</b></div>
            <div><span>${belmT("Petty Cash used")}</span><b>${tzs(pc.totalUsed)}</b></div>
            <div><span>${belmT("Petty Cash balance")}</span><b>${tzs(pc.balance)}</b></div>
            <div><span>${belmT("Invoices total")}</span><b>${tzs(inv.total)}</b></div>
            <div><span>${belmT("Invoices outstanding")}</span><b>${tzs(inv.outstanding)}</b></div>
          </div>
        </section>
        <section class="belm-analysis-section">
          <h3>${belmT("SERVICE & SUPPORT")}</h3>
          <div class="belm-analysis-grid">
            <div><span>${belmT("Total service requests")}</span><b>${sr.total ?? 0}</b></div>
            <div><span>${belmT("Open service requests")}</span><b>${sr.open ?? 0}</b></div>
            <div><span>${belmT("Checklist reports")}</span><b>${data.checklistReportsCount ?? 0}</b></div>
            <div><span>${belmT("Containers handled")}</span><b>${data.totalContainersHandled ?? 0}</b></div>
          </div>
        </section>
        <section class="belm-analysis-section">
          <h3>${belmT("PER-MACHINE BREAKDOWN")}</h3>
          ${perMachine.length ? `
          <table class="belm-analysis-table">
            <thead><tr><th>${belmT("Machine")}</th><th>${belmT("Status")}</th><th>${belmT("Requests")}</th><th>${belmT("Reports")}</th><th>${belmT("Procurement")}</th><th>${belmT("Service level")}</th></tr></thead>
            <tbody>${perMachine.map((row) => `
              <tr>
                <td>${escapeHtml(row.name)}</td>
                <td><span class="belm-analysis-pill status-${String(row.status || "").toLowerCase()}">${escapeHtml(row.status || "-")}</span></td>
                <td>${row.openServiceRequests ?? 0}</td>
                <td>${row.checklistReportsCount ?? 0}</td>
                <td>${tzs(row.expensesTotal)}</td>
                <td><span class="belm-analysis-pill status-${String(row.serviceLevel || "").toLowerCase()}">${escapeHtml(row.serviceLevel || "-")}</span></td>
              </tr>`).join("")}</tbody>
          </table>` : `<p class="belm-general-analysis-loading">${belmT("No machines registered yet.")}</p>`}
        </section>`;
    } catch (_) {
      body.innerHTML = `<p class="belm-general-analysis-loading">${belmT("Could not load analysis.")}</p>`;
    }
  }

  function closeCustomerPrivacyDialog() {
    const existing = document.getElementById("belmCustomerPrivacyDialog");
    if (existing) existing.remove();
  }

  async function openCustomerPrivacyDialog() {
    closeCustomerPrivacyDialog();
    const dialog = document.createElement("dialog");
    dialog.id = "belmCustomerPrivacyDialog";
    dialog.className = "belm-privacy-dialog";
    dialog.innerHTML = `
      <div class="belm-privacy-head">
        <div><h2>${belmT("PRIVACY & BELM ACCESS")}</h2><p>${belmT("Customer-controlled data sharing")}</p></div>
        <button type="button" data-close-privacy>${belmT("Close")}</button>
      </div>
      <div class="belm-privacy-body">
        <p class="belm-privacy-loading">Loading privacy settings…</p>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector("[data-close-privacy]")?.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();

    const body = dialog.querySelector(".belm-privacy-body");
    const token = localStorage.getItem("belm_customer_token");
    try {
      const response = await fetch("/api/customer-portal/privacy", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load privacy settings.");
      const prefs = data.preferences || {};
      const option = (key, title, detail) => `
        <label class="belm-privacy-option">
          <span><b>${belmT(title)}</b><small>${belmT(detail)}</small></span>
          <span class="belm-privacy-switch">
            <input type="checkbox" data-privacy-key="${key}" ${prefs[key] ? "checked" : ""}>
            <i aria-hidden="true"></i>
          </span>
        </label>`;
      body.innerHTML = `
        <div class="belm-privacy-note">
          <b>${belmT("Always shared with BELM")}</b>
          <span>${belmT("Basic company/machine identity, official support requests, and direct BELM communications remain available.")}</span>
        </div>
        <div class="belm-privacy-options">
          ${option("maintenanceRecords", "Check-up & maintenance records", "Allow BELM to view internal checklist, check-up and maintenance history when not otherwise required for active service/support.")}
          ${option("expenseReceipts", "Procurement & receipt photos", "Allow BELM to view machine procurement records, petty-cash records and uploaded receipt images.")}
          ${option("storeAndParts", "Store & service-parts records", "Allow BELM to view internal service-part/service-kit and store-related records when not otherwise required for active service/support.")}
          ${option("teamDirectory", "Customer team/user directory", "Allow BELM to view and manage the Customer Portal team/user directory.")}
        </div>
        <div class="belm-privacy-provider-note ${data.belmServiceProviderActive ? "active" : ""}">
          <b>${belmT("Service Provider exception")}</b>
          <span>${belmT("When BELM Service Provider is ON, maintenance/check-up and service-kit data needed to perform the service remains accessible. An open official support request also grants temporary access for that machine.")}</span>
        </div>
        <div class="belm-privacy-actions">
          <a href="/legal/privacy-policy.html" target="_blank" rel="noopener">${belmT("Open Privacy Policy")}</a>
          <button type="button" data-save-privacy>${belmT("Save privacy")}</button>
        </div>
        <p class="belm-privacy-status" aria-live="polite"></p>`;

      body.querySelector("[data-save-privacy]")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const status = body.querySelector(".belm-privacy-status");
        button.disabled = true;
        status.textContent = "Saving…";
        const preferences = {};
        body.querySelectorAll("[data-privacy-key]").forEach((input) => {
          preferences[input.dataset.privacyKey] = input.checked;
        });
        try {
          const save = await fetch("/api/customer-portal/privacy", {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ preferences }),
          });
          const saved = await save.json().catch(() => ({}));
          if (!save.ok) throw new Error(saved.error || "Could not save privacy settings.");
          status.textContent = belmT("Privacy settings saved.");
          customerPortalProfile = null;
          customerPortalProfilePromise = null;
        } catch (error) {
          status.textContent = error.message || "Could not save privacy settings.";
        } finally {
          button.disabled = false;
        }
      });
    } catch (error) {
      body.innerHTML = `<p class="belm-analysis-error">${escapeHtml(error.message || "Could not load privacy settings.")}</p>`;
    }
  }

  // V254 - "UPDATE" button in MORE TOOLS: a single place to see recent
  // BELM messages, Technician daily check-up activity, and a small 7-day
  // activity graph. The button itself keeps a gentle red blink whenever
  // any machine is currently RED, using the same blink animation as the
  // Action Center's urgent machines (V236) - so it stays a persistent,
  // at-a-glance signal that something needs attention, without changing
  // anything else already on the dashboard.
  async function refreshBelmUpdatesBlink() {
    const button = document.getElementById("belmUpdatesButton");
    if (!button) return;
    try {
      const token = localStorage.getItem("belm_customer_token");
      const response = await fetch("/api/customer-portal/recent-activity", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const data = await response.json();
      // V271 - blink for either a RED machine OR any BELM message the
      // customer hasn't dismissed yet (same "OK" dismissal tracking the
      // Messages from BELM panel itself already uses) - a new message is
      // just as urgent a signal as a machine going red.
      const dismissed = new Set(JSON.parse(localStorage.getItem("belm_dismissed_messages") || "[]"));
      const hasUnreadMessage = (data.belmMessages || []).some((msg) => !dismissed.has(String(msg.id)));
      button.classList.toggle("belm-machine-urgent-blink", Number(data.redMachineCount || 0) > 0 || hasUnreadMessage);
    } catch (_) {}
  }
  function closeCustomerUpdatesDialog() {
    document.getElementById("belmUpdatesDialog")?.remove();
  }
  async function openCustomerUpdatesDialog() {
    closeCustomerUpdatesDialog();
    const dialog = document.createElement("dialog");
    dialog.id = "belmUpdatesDialog";
    dialog.className = "belm-general-analysis-dialog";
    dialog.innerHTML = `
      <div class="belm-general-analysis-head">
        <div><h2>${belmT("UPDATES")}</h2><p>${belmT("Latest messages from BELM, Technician daily activity, and machine activity — all in one place.")}</p></div>
        <button type="button" data-close-general-analysis>${belmT("Close")}</button>
      </div>
      <div class="belm-general-analysis-body" id="belmUpdatesBody">
        <p class="belm-general-analysis-loading">${belmT("Loading updates…")}</p>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector("[data-close-general-analysis]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();

    const body = dialog.querySelector("#belmUpdatesBody");
    try {
      const token = localStorage.getItem("belm_customer_token");
      const response = await fetch("/api/customer-portal/recent-activity", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const graph = Array.isArray(data.sevenDayGraph) ? data.sevenDayGraph : [];
      const maxTotal = Math.max(1, ...graph.map((day) => day.total));
      const dayLabel = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(belmLang() === "sw" ? "sw-TZ" : "en-GB", { weekday: "short" });
      body.innerHTML = `
        <section class="belm-analysis-section">
          <h3>${belmT("CHECKUP ACTIVITY — LAST 7 DAYS")}</h3>
          <div class="belm-updates-graph">
            ${graph.map((day) => {
              const height = Math.round((day.total / maxTotal) * 100);
              const barColor = day.red > 0 ? "#ff6b6b" : day.yellow > 0 ? "#ffd400" : "#00c46a";
              return `<div class="belm-updates-graph-col">
                <div class="belm-updates-graph-bar" style="height:${Math.max(height, day.total ? 6 : 2)}%;background:${day.total ? barColor : "rgba(255,255,255,.12)"}" title="${escapeHtml(String(day.total))}"></div>
                <span>${escapeHtml(dayLabel(day.day))}</span>
              </div>`;
            }).join("")}
          </div>
        </section>
        <section class="belm-analysis-section">
          <h3>${belmT("FROM BELM")}</h3>
          ${data.belmMessages?.length ? `<div class="belm-updates-list">${data.belmMessages.map((msg) => `
            <article class="belm-updates-row">
              <div class="belm-updates-row-head"><strong>${escapeHtml(msg.subject || "Message from BELM")}</strong><span>${escapeHtml(formatTanzaniaDateTime(msg.createdAt))}</span></div>
              <p>${escapeHtml(msg.message || "")}</p>
              ${msg.machineLabel ? `<small>${escapeHtml(msg.machineLabel)}</small>` : ""}
            </article>`).join("")}</div>` : `<p class="belm-general-analysis-loading">${belmT("No messages from BELM yet.")}</p>`}
        </section>
        <section class="belm-analysis-section">
          <h3>${belmT("FROM TECHNICIAN (DAILY ACTIVITY)")}</h3>
          ${data.technicianActivity?.length ? `<div class="belm-updates-list">${data.technicianActivity.map((row) => `
            <article class="belm-updates-row">
              <div class="belm-updates-row-head">
                <strong>${escapeHtml(row.machineLabel || "Machine")}</strong>
                <span class="belm-analysis-pill status-${String(row.status || "").toLowerCase()}">${escapeHtml(row.status || "-")}</span>
              </div>
              <small>${belmT("Filled by")}: ${escapeHtml(row.filledBy || "-")} · ${escapeHtml(formatTanzaniaDateTime(row.createdAt))}</small>
            </article>`).join("")}</div>` : `<p class="belm-general-analysis-loading">${belmT("No checkup activity recorded yet.")}</p>`}
        </section>`;
      const dismissedNow = new Set(JSON.parse(localStorage.getItem("belm_dismissed_messages") || "[]"));
      const stillUnread = (data.belmMessages || []).some((msg) => !dismissedNow.has(String(msg.id)));
      document.getElementById("belmUpdatesButton")?.classList.toggle("belm-machine-urgent-blink", Number(data.redMachineCount || 0) > 0 || stillUnread);
    } catch (_) {
      body.innerHTML = `<p class="belm-general-analysis-loading">${belmT("Could not load updates.")}</p>`;
    }
  }


  document.body.dataset.belmArea = pathname.startsWith("/admin")
    ? "admin"
    : pathname.startsWith("/tech")
      ? "tech"
      : pathname.startsWith("/portal")
        ? "portal"
        : "public";

  // V198: all pages share one personal theme manager. These small wrappers
  // keep older portal hooks compatible without falling back to the former
  // company-wide displayTheme setting or the shared customer-id storage key.
  function applyTheme(theme) {
    if (window.BELMTheme) return window.BELMTheme.set(theme);
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", safeTheme === "dark");
    document.documentElement.dataset.theme = safeTheme;
    return Promise.resolve(safeTheme);
  }

  async function syncSavedTheme() {
    if (window.BELMTheme) await window.BELMTheme.refresh();
  }

  function installThemeSaving() {
    if (window.BELMTheme) window.BELMTheme.refresh();
  }

  function applyCustomerTheme(theme) {
    return applyTheme(theme);
  }

  function installCustomerThemeToggle() {
    if (window.BELMTheme) window.BELMTheme.refresh();
  }

  function tokenPayload(storageKey) {
    const token = localStorage.getItem(storageKey);
    if (!token) return null;
    try {
      const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(Array.from(atob(encoded))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")));
    } catch {
      return null;
    }
  }

  function redirectIfAlreadyLoggedIn() {
    const pathname = window.location.pathname;

    function isValid(storageKey) {
      const payload = tokenPayload(storageKey);
      if (!payload) return false;
      if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) return false;
      return true;
    }

    if (pathname === "/admin/login" && isValid("belm_admin_token")) {
      window.location.replace("/overview-manager/");
      return true;
    }
    if (pathname === "/portal/login" && isValid("belm_customer_token")) {
      // V248 - a customer portal link looks like
      // /portal/login?customer=<slug>, uniquely identifying ONE customer.
      // This used to skip straight to /portal/dashboard as long as ANY
      // valid customer token was already sitting in localStorage, with no
      // check that the cached token actually belonged to the customer the
      // link points to. Opening a second, different customer's link in the
      // same browser (still holding the first customer's token from an
      // earlier session) silently landed on the FIRST customer's dashboard
      // instead - "different links open the same account". Now the token's
      // own portalLink claim must match the ?customer= slug in the URL
      // before we skip the login form; otherwise the stale token is
      // cleared so the correct customer can actually log in.
      const requestedSlug = new URLSearchParams(window.location.search).get("customer") || "";
      const payload = tokenPayload("belm_customer_token");
      const tokenSlug = String(payload?.portalLink || "").toLowerCase();
      if (!requestedSlug || tokenSlug === requestedSlug.toLowerCase()) {
        window.location.replace("/portal/dashboard");
        return true;
      }
      localStorage.removeItem("belm_customer_token");
      return false;
    }
    return false;
  }


  // V303: /tech is now workspace-only. Anybody without a valid Technician
  // session starts from the same /login page as every other portal account.
  function enforceUnifiedTechnicianLogin() {
    if (!window.location.pathname.startsWith('/tech')) return false;
    const tech = tokenPayload('belm_tech_token');
    if (tech && (!tech.exp || tech.exp * 1000 > Date.now())) return false;
    const admin = tokenPayload('belm_admin_token');
    if (admin && String(admin.roleName || '').toLowerCase() === 'technician' && (!admin.exp || admin.exp * 1000 > Date.now())) return false;
    window.location.replace('/login');
    return true;
  }

  // The React dashboard sometimes shows an internal view (like "Checklist
  // Reports" for one machine) without changing the URL away from
  // /portal/dashboard. If the user then navigates elsewhere and presses the
  // browser's Back button, the app can restore that same stuck internal
  // view instead of the normal dashboard — even though the address bar
  // correctly shows /portal/dashboard. Forcing a full reload whenever
  // back/forward navigation lands on this URL guarantees a fresh, correct
  // dashboard every time.
  window.addEventListener("popstate", () => {
    if (window.location.pathname === "/portal/dashboard") {
      window.location.reload();
    }
  });

  // Broader fix for the same underlying issue across every page this
  // script manages — mobile browsers often restore a page from their
  // "back-forward cache" (bfcache) on Back/Forward instead of truly
  // reloading it, which means all our injected buttons/panels/listeners
  // are gone (they were only ever attached once, on the original load)
  // even though the page LOOKS normal. event.persisted === true is the
  // signal a bfcache restore just happened; forcing one reload then
  // guarantees everything re-attaches correctly, instead of the page
  // silently staying "stuck" until the person manually refreshes.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.location.reload();
  });

  function handoffTechnicianSession() {
    if (!window.location.pathname.startsWith("/tech")) return false;
    if (localStorage.getItem("belm_tech_token") && localStorage.getItem("belm_tech_user")) {
      return false;
    }
    const adminToken = localStorage.getItem("belm_admin_token");
    if (!adminToken) return false;
    const payload = tokenPayload("belm_admin_token");
    let adminUser = {};
    try {
      adminUser = JSON.parse(localStorage.getItem("belm_admin_user") || "{}");
    } catch (_) {}
    const role = payload?.roleName || adminUser.role;
    if (String(role || "").toLowerCase() !== "technician") return false;

    localStorage.setItem("belm_tech_token", adminToken);
    localStorage.setItem("belm_tech_user", JSON.stringify({
      id: payload?.id || adminUser.id || "",
      name: payload?.name || adminUser.name || "Technician",
      assignedCustomerId: payload?.assignedCustomerId || adminUser.assignedCustomerId || "",
      assignedCustomerName: adminUser.assignedCustomerName || "",
    }));
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.reload();
    return true;
  }

  async function pendingCount(token) {
    try {
      const response = await fetch("/api/applications?status=PENDING", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const data = await response.json();
      return Array.isArray(data.applications) ? data.applications.length : null;
    } catch {
      return null;
    }
  }

  async function refreshShortcut() {
    const old = document.getElementById(buttonId);
    const token = localStorage.getItem("belm_admin_token");
    const onAdminPage = window.location.pathname.startsWith("/admin");
    if (!token || !onAdminPage) {
      if (old) old.remove();
      return;
    }
    if (old) return;

    const link = document.createElement("a");
    link.id = buttonId;
    link.href = "/admin-applications/";
    link.textContent = "Access Applications";
    Object.assign(link.style, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: "9999",
      background: "#00a651",
      color: "#fff",
      padding: "12px 16px",
      border: "2px solid #ffd400",
      borderRadius: "999px",
      boxShadow: "0 10px 28px rgba(21, 29, 49, .25)",
      font: "700 13px Inter, system-ui, sans-serif",
      textDecoration: "none",
    });
    document.body.appendChild(link);

    const count = await pendingCount(token);
    if (count !== null) {
      link.textContent = count > 0
        ? `Access Applications (${count})`
        : "Access Applications";
      if (count > 0) {
        link.style.background = "#ffd400";
        link.style.color = "#151d31";
        link.style.borderColor = "#00a651";
      }
    }
  }

  async function syncTechnicianCustomerName() {
    if (!window.location.pathname.startsWith("/tech")) return;
    const techToken = localStorage.getItem("belm_tech_token");
    const rawUser = localStorage.getItem("belm_tech_user");
    if (!techToken || !rawUser) return;

    let techUser;
    try {
      techUser = JSON.parse(rawUser);
    } catch {
      return;
    }
    if (!techUser.assignedCustomerId || techUser.assignedCustomerName) return;
    const syncKey = `belm-tech-customer-${techUser.assignedCustomerId}`;
    if (sessionStorage.getItem(syncKey)) return;
    sessionStorage.setItem(syncKey, "running");

    try {
      const response = await fetch(`/api/customers/${techUser.assignedCustomerId}`, {
        headers: { Authorization: `Bearer ${techToken}` },
      });
      if (!response.ok) {
        sessionStorage.removeItem(syncKey);
        return;
      }
      const customer = await response.json();
      techUser.assignedCustomerName = customer.name;
      localStorage.setItem("belm_tech_user", JSON.stringify(techUser));
      sessionStorage.setItem(syncKey, "done");
      window.location.reload();
    } catch {
      sessionStorage.removeItem(syncKey);
    }
  }

  async function addTechnicianCustomerDashboardShortcut() {
    if (!window.location.pathname.startsWith("/tech")) return;
    if (document.getElementById("belm-tech-customer-dashboard")) return;
    const token = localStorage.getItem("belm_tech_token");
    if (!token) return;
    try {
      const response = await fetch("/api/customer-portal/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      const permissions = data?.customer?.actorPermissions;
      const hasDashboardAccess = permissions === null || (Array.isArray(permissions) && permissions.length > 0);
      if (!hasDashboardAccess) return;

      const button = document.createElement("button");
      button.id = "belm-tech-customer-dashboard";
      button.type = "button";
      const companyName = data?.customer?.name || roleContextCustomerName() || "Customer";
      button.textContent = permissions === null ? `${companyName} Dashboard - Full Control` : `${companyName} Dashboard`;
      Object.assign(button.style, {
        position: "fixed",
        right: "18px",
        bottom: "150px",
        zIndex: "9998",
        background: "#151d31",
        color: "#fff",
        border: "2px solid #00a651",
        borderRadius: "999px",
        padding: "10px 14px",
        font: "800 12px Inter,system-ui,sans-serif",
        boxShadow: "0 10px 26px rgba(21,29,49,.24)",
        cursor: "pointer",
      });
      button.addEventListener("click", () => {
        localStorage.setItem("belm_customer_token", token);
        window.location.href = "/portal/dashboard";
      });
      document.body.appendChild(button);
    } catch (_) {}
  }

  function clarifyTechnicianAssignment() {
    if (!window.location.pathname.startsWith("/admin")) return;
    for (const item of document.querySelectorAll("option")) {
      if (item.textContent.trim() === "None — see all customers") {
        item.textContent = "Select customer — required for Technician";
      }
    }
  }

  function clarifyTechnicianChecklistSave() {
    if (!window.location.pathname.startsWith("/tech")) return;
    document.querySelectorAll("button").forEach((button) => {
      if ((button.textContent || "").trim() === "Submit report") {
        button.textContent = "Save Checklist";
      }
    });
  }

  function enhanceCustomerLogin() {
    if (window.location.pathname !== "/portal/login") return;
    for (const label of document.querySelectorAll("label")) {
      if (label.textContent.trim() === "Portal link / ID") {
        const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
        if (textNode) textNode.nodeValue = "Email address / Portal ID";
      }
    }
    const loginInput = document.querySelector('form input:not([type="password"])');
    if (loginInput) loginInput.placeholder = "customer@email.com or customer-name";
    const customerSlug = new URLSearchParams(window.location.search).get("customer");
    const form = document.querySelector("form");
    if (customerSlug && loginInput && !loginInput.value) {
      const nativeValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      if (nativeValueSetter) {
        nativeValueSetter.call(loginInput, customerSlug);
      } else {
        loginInput.value = customerSlug;
      }
      loginInput.dispatchEvent(new Event("input", { bubbles: true }));
      loginInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (customerSlug && form && !document.getElementById("belm-customer-link-note")) {
      const note = document.createElement("div");
      note.id = "belm-customer-link-note";
      note.textContent = `Customer portal: ${customerSlug.replace(/-/g, " ")}`;
      Object.assign(note.style, {
        marginBottom: "14px",
        padding: "9px 11px",
        border: "1px solid #efd65d",
        borderRadius: "8px",
        background: "#fff9cf",
        color: "#151d31",
        font: "700 12px Inter, system-ui, sans-serif",
        textTransform: "capitalize",
      });
      const labels = form.querySelectorAll("label");
      if (labels.length > 0) form.insertBefore(note, labels[0]);
    }
  }

  function addForgotPasswordLink() {
    const isLoginPage = window.location.pathname === "/portal/login"
      || window.location.pathname === "/admin/login"
      || window.location.pathname === "/tech";
    if (!isLoginPage || document.getElementById("belm-forgot-password")) return;
    const form = document.querySelector("form");
    if (!form || !form.querySelector('input[type="password"]')) return;
    const link = document.createElement("a");
    link.id = "belm-forgot-password";
    link.href = "/forgot-password/";
    link.textContent = "Forgot password? Get OTP by email";
    Object.assign(link.style, {
      display: "block",
      margin: "10px 0 4px",
      color: "#008640",
      font: "700 12px Inter, system-ui, sans-serif",
      textAlign: "right",
      textDecoration: "none"
    });
    form.appendChild(link);
  }

  function addPortalHomeLink() {
    const isLoginPage = window.location.pathname === "/portal/login"
      || window.location.pathname === "/admin/login"
      || window.location.pathname === "/tech";
    if (!isLoginPage || document.getElementById("belm-portal-home-link")) return;
    const form = document.querySelector("form");
    if (!form) return;

    const link = document.createElement("a");
    link.id = "belm-portal-home-link";
    link.href = "/";
    link.textContent = "← Back to Portal Home";
    Object.assign(link.style, {
      display: "block",
      marginTop: "14px",
      color: "#008640",
      font: "700 12px Inter, system-ui, sans-serif",
      textAlign: "center",
      textDecoration: "none"
    });
    form.appendChild(link);
  }

  function enforceAdminPageAccess() {
    if (!window.location.pathname.startsWith("/admin/") || window.location.pathname === "/admin/login") return;
    let user;
    try {
      user = JSON.parse(localStorage.getItem("belm_admin_user") || "null");
    } catch (_) {
      return;
    }
    if (!user || user.role === "Super Admin" || user.allowedPages === null) return;
    const allowed = Array.isArray(user.allowedPages) ? user.allowedPages : [];
    const key = window.location.pathname.split("/")[2] || "";
    if (!key || allowed.includes(key)) return;
    if (user.role === "Technician") {
      window.location.replace("/tech");
      return;
    }
    const first = allowed[0];
    if (first) window.location.replace(`/admin/${first}`);
  }

  function enhanceCustomerAssistants() {
    if (!window.location.pathname.startsWith("/portal/dashboard")) return;
    // The native React dashboard places "+ Add user" in the top-right.
    // User management now lives under MORE TOOLS as +USER so the machine
    // heading stays clean and every customer starts from one Role Manager.
    for (const button of document.querySelectorAll("button")) {
      if (!["+ Add user", "+ Manage assistants", "+ USER", "+USER"].includes(button.textContent.trim())) continue;
      button.dataset.belmNativeAddUser = "1";
      button.style.display = "none";
      button.setAttribute("aria-hidden", "true");
      button.tabIndex = -1;
    }
  }

  function customerRoleKey() {
    const payload = tokenPayload("belm_customer_token") || {};
    return String(payload.customerRole || payload.roleName || payload.role || "").toLowerCase();
  }

  function isCustomerOperatorRole() {
    return customerRoleKey() === "operator";
  }

  function enforceOperatorCardOnlyInterface() {
    if (!isCustomerOperatorRole()) return;
    document.body.classList.add("belm-operator-card-only");
    ["belmActivityOverviewCard", "belmAccountToolsCard", "belmCustomerDirectMessagesPanel",
     "belmCustomerProformasPanel", "belmAnnouncementsPanel", "belmShowHiddenRequestsLink"]
      .forEach((id) => document.getElementById(id)?.remove());

    const layout = document.getElementById("belmDashboardLayout");
    const grid = layout?.querySelector(".belm-customer-machine-grid");
    if (layout && grid && layout.parentElement) {
      layout.parentElement.insertBefore(grid, layout);
      layout.remove();
    }

    const serviceHeading = Array.from(document.querySelectorAll("h1,h2,h3"))
      .find((el) => (el.textContent || "").trim() === "Your service requests");
    if (serviceHeading) {
      serviceHeading.style.display = "none";
      if (serviceHeading.nextElementSibling) serviceHeading.nextElementSibling.style.display = "none";
    }

    document.querySelectorAll("button,a").forEach((element) => {
      const text = (element.textContent || "").trim();
      if (["+ Request service", "+ Request Service", "+ Spare & Service Request", "+ Add user", "+ Manage assistants"].includes(text)) {
        element.style.display = "none";
      }
    });

    const machinesHeading = Array.from(document.querySelectorAll("h1,h2"))
      .find((el) => (el.textContent || "").trim() === "Your machines");
    if (machinesHeading && !document.getElementById("belmOperatorCardOnlyBanner")) {
      const banner = document.createElement("div");
      banner.id = "belmOperatorCardOnlyBanner";
      banner.className = "belm-operator-card-only-banner";
      banner.innerHTML = '<b>OPERATOR WORKSPACE</b><span>Chagua mashine husika, kisha tumia functions zilizo ndani ya card yake. Access yako inadhibitiwa na Role Manager.</span>';
      machinesHeading.parentElement?.insertAdjacentElement("beforebegin", banner);
    }
  }

  async function loadCustomerPortalProfile() {
    if (customerPortalProfile) return customerPortalProfile;
    if (customerPortalProfilePromise) return customerPortalProfilePromise;
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return null;
    customerPortalProfilePromise = fetch("/api/customer-portal/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load customer profile.");
        const dashboard = await response.json();
        customerPortalProfile = dashboard.customer || null;
        customerCurrentPermissions = dashboard.customer?.actorPermissions;
        if (Array.isArray(dashboard.machines)) customerExpenseMachines = dashboard.machines;
        return customerPortalProfile;
      })
      .catch(() => {
        customerPortalProfilePromise = null;
        return null;
      });
    return customerPortalProfilePromise;
  }

  async function loadCustomerExpenseMachines() {
    if (customerExpenseMachines) return customerExpenseMachines;
    if (customerExpenseMachinesPromise) return customerExpenseMachinesPromise;
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return [];
    customerExpenseMachinesPromise = fetch("/api/customer-portal/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load machines.");
        const dashboard = await response.json();
        customerExpenseMachines = Array.isArray(dashboard.machines) ? dashboard.machines : [];
        customerPortalProfile = dashboard.customer || customerPortalProfile;
        customerCurrentPermissions = dashboard.customer?.actorPermissions;
        return customerExpenseMachines;
      })
      .catch(() => {
        customerExpenseMachinesPromise = null;
        return [];
      });
    return customerExpenseMachinesPromise;
  }

  function customerMachineInfoCard(card, machine) {
    if (card.dataset.belmCustomerInfoReady === "1") return;
    card.dataset.belmCustomerInfoReady = "1";
    const condition = technicianCondition(machine.status);
    const opStatus = String(machine.operationalStatus || machine.operational_status || "NORMAL").toUpperCase();
    const opLabels = {
      NORMAL: "Normal - no active work", SERVICE_IN_PROGRESS: "Service in progress",
      CHECKUP_IN_PROGRESS: "Check-up in progress", MAINTENANCE_IN_PROGRESS: "Maintenance in progress",
      GROUNDED: "Grounded - not operational",
    };
    const lastChecked = machine.lastCheckedAt || machine.last_checked_at;
    const details = document.createElement("div");
    details.className = "belm-technician-machine-info belm-machine-info-v210";
    details.innerHTML = `
      <div class="belm-machine-state-row">
        <div class="belm-technician-machine-health status-${escapeHtml(condition.status.toLowerCase())}">
          <div><span>Machine Status</span><strong>${escapeHtml(condition.status)}</strong></div>
          <div><span>Condition</span><strong>${escapeHtml(condition.label)}</strong><small>${escapeHtml(condition.note)}</small></div>
        </div>
        <div class="belm-customer-op-status op-${escapeHtml(opStatus)}">
          <span>Current Activity</span>
          <strong>${escapeHtml(opLabels[opStatus] || "Normal")}</strong>
        </div>
      </div>
      <details class="belm-machine-details-disclosure">
        <summary>Machine details <span>Brand, type, serial, registration & service kit</span></summary>
        <div class="belm-technician-machine-data">
          <div><span>Brand</span><b>${escapeHtml(machine.brand || "Not recorded")}</b></div>
          <div><span>Machine Type</span><b>${escapeHtml(machine.machineType || machine.machine_type || "Not recorded")}</b></div>
          <div><span>Serial No.</span><b>${escapeHtml(machine.serialNumber || machine.serial_number || "Not recorded")}</b></div>
          <div><span>Registration</span><b>${escapeHtml(machine.regNumber || machine.reg_number || "Not recorded")}</b></div>
          <div><span>Service Kit</span><b>${escapeHtml(machine.serviceKit || machine.service_kit || "Not recorded")}</b></div>
          <div><span>Last Checked</span><b>${escapeHtml(lastChecked ? new Date(lastChecked).toLocaleDateString() : "Never checked")}</b></div>
        </div>
      </details>
      <div class="belm-machine-recent-updates" id="belmRecentUpdates-${escapeHtml(machine.id)}"></div>`;
    card.appendChild(details);
    details.addEventListener("click", (event) => event.stopPropagation());
    details.addEventListener("pointerdown", (event) => event.stopPropagation());
    if (localStorage.getItem("belm_customer_token")) loadCustomerMachineRecentUpdates(machine.id, machine);
  }

  function dismissedUpdateIds() {
    try {
      return new Set((JSON.parse(localStorage.getItem("belm_dismissed_updates") || "[]") || []).map(String));
    } catch (_) {
      return new Set();
    }
  }
  function dismissUpdateId(id) {
    const dismissed = dismissedUpdateIds();
    dismissed.add(String(id));
    // Keep the stored list from growing forever — only the most recent
    // 200 dismissed IDs are kept, which is far more than anyone will
    // realistically accumulate across all their machines.
    const trimmed = Array.from(dismissed).slice(-200);
    localStorage.setItem("belm_dismissed_updates", JSON.stringify(trimmed));
  }

  // V293 - one lightweight global ticker drives every visible machine card.
  // This avoids creating one interval per machine while still rotating each
  // card through its own real operational updates.
  const customerMachineUpdateRotators = new Map();
  let customerMachineUpdateRotationTimer = null;

  function machineUpdateType(update) {
    if (update?.typeLabel) return { label: String(update.typeLabel), tone: String(update.tone || "blue") };
    const id = String(update?.id || "");
    if (id.startsWith("srh-")) return { label: "SERVICE", tone: "blue" };
    if (id.startsWith("op-open-")) return { label: "PROBLEM", tone: "red" };
    if (id.startsWith("op-")) return { label: "RESOLVED", tone: "green" };
    if (id.startsWith("check-")) return { label: "CHECK-UP", tone: "yellow" };
    if (id.startsWith("comm-")) return { label: update.direction === "CUSTOMER_TO_BELM" ? "TO BELM" : "FROM BELM", tone: "purple" };
    return { label: "UPDATE", tone: "blue" };
  }

  // V294 - communication direction uses the real company name instead of
  // the generic word CUSTOMER on Customer Portal machine updates.
  function customerCommunicationDirection(direction) {
    const companyName = String(customerPortalProfile?.name || roleContextCustomerName() || "Customer").trim() || "Customer";
    return direction === "CUSTOMER_TO_BELM" ? `${companyName} → BELM` : `BELM → ${companyName}`;
  }

  function machineLiveSummaryUpdates(machine) {
    if (!machine) return [];
    const id = String(machine.id || "machine");
    const condition = technicianCondition(machine.status);
    const opStatus = String(machine.operationalStatus || machine.operational_status || "NORMAL").toUpperCase();
    const opLabels = {
      NORMAL: "Normal - no active work",
      SERVICE_IN_PROGRESS: "Service in progress",
      CHECKUP_IN_PROGRESS: "Check-up in progress",
      MAINTENANCE_IN_PROGRESS: "Maintenance in progress",
      GROUNDED: "Grounded - not operational",
    };
    const lastChecked = machine.lastCheckedAt || machine.last_checked_at || null;
    const stamp = lastChecked || new Date().toISOString();
    const updates = [{
      id: `system-health-${id}-${condition.status}-${String(lastChecked || "never")}`,
      text: `Machine condition: ${condition.label}. ${condition.note}`,
      createdAt: stamp,
      typeLabel: "CONDITION",
      tone: condition.status === "RED" ? "red" : condition.status === "YELLOW" ? "yellow" : "green",
    }];
    updates.push({
      id: `system-activity-${id}-${opStatus}`,
      text: `Current activity: ${opLabels[opStatus] || "Normal"}.`,
      createdAt: new Date().toISOString(),
      typeLabel: "ACTIVITY",
      tone: opStatus === "GROUNDED" ? "red" : opStatus === "NORMAL" ? "green" : "yellow",
    });
    return updates;
  }

  function mergeMachineServiceLiveUpdate(machineId, status) {
    const state = customerMachineUpdateRotators.get(String(machineId));
    if (!state || !status) return;
    const remaining = Math.round(Number(status.hoursRemaining || 0));
    const overdueBy = Math.max(0, Math.round(Math.abs(Math.min(0, remaining))));
    const serviceType = status.serviceType || `${status.intervalHours}-Hour Service`;
    const text = status.level === "RED"
      ? `${serviceType} is overdue${overdueBy ? ` by ${overdueBy} hours` : " and due now"}.`
      : status.level === "YELLOW"
        ? `${serviceType} is due soon. ${Math.max(0, remaining)} hours remaining.`
        : `${serviceType} is on schedule. ${Math.max(0, remaining)} hours remaining.`;
    const update = {
      id: `system-service-${machineId}-${status.level}-${status.dueHour}-${remaining}`,
      text,
      createdAt: new Date().toISOString(),
      typeLabel: "SERVICE PLAN",
      tone: status.level === "RED" ? "red" : status.level === "YELLOW" ? "yellow" : "green",
    };
    if (dismissedUpdateIds().has(String(update.id))) return;
    if (!state.updates.some((item) => String(item.id) === String(update.id))) state.updates.splice(Math.min(2, state.updates.length), 0, update);
    if (!state.allUpdates.some((item) => String(item.id) === String(update.id))) state.allUpdates.splice(Math.min(2, state.allUpdates.length), 0, update);
    renderMachineUpdateSlide(machineId);
  }

  function renderMachineUpdateSlide(machineId) {
    const state = customerMachineUpdateRotators.get(String(machineId));
    const box = document.getElementById(`belmRecentUpdates-${machineId}`);
    if (!state || !box || !state.updates.length) return;
    if (state.index >= state.updates.length) state.index = 0;
    const update = state.updates[state.index];
    const type = machineUpdateType(update);
    box.innerHTML = `
      <div class="belm-machine-update-headline">
        <span class="belm-machine-recent-updates-head">LIVE MACHINE UPDATES</span>
        <small>${state.index + 1} / ${state.updates.length}</small>
      </div>
      <div class="belm-machine-recent-update-row belm-machine-update-slide tone-${escapeHtml(type.tone)}" data-update-id="${escapeHtml(update.id)}">
        <div class="belm-machine-update-copy">
          <small class="belm-machine-update-type">${escapeHtml(type.label)}</small>
          ${update.direction ? `<small class="belm-comm-direction">${escapeHtml(customerCommunicationDirection(update.direction))}</small>` : ""}
          <span>${escapeHtml(update.text)}</span>
          <small class="belm-machine-update-time">${escapeHtml(formatTanzaniaDateTime(update.createdAt))}</small>
        </div>
        <div class="belm-machine-update-actions">
          ${update.relatedType === "PROFORMA" && update.relatedId ? `<button type="button" class="belm-update-ok-button" data-open-customer-proforma="${escapeHtml(update.relatedId)}">View PDF</button>` : ""}
          <button type="button" class="belm-update-ok-button" data-dismiss-update="${escapeHtml(update.id)}">HIDE</button>
        </div>
      </div>
      ${state.updates.length > 1 ? `<div class="belm-machine-update-progress"><span style="width:${Math.max(8, ((state.index + 1) / state.updates.length) * 100)}%"></span></div>` : ""}
      ${state.allUpdates.length > 1 ? `<button type="button" class="belm-show-hidden-requests-link" data-view-all-communications>View all updates</button>` : ""}`;

    box.querySelector("[data-dismiss-update]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = String(event.currentTarget.dataset.dismissUpdate || "");
      dismissUpdateId(id);
      state.updates = state.updates.filter((item) => String(item.id) !== id);
      state.allUpdates = state.allUpdates.filter((item) => String(item.id) !== id);
      if (!state.updates.length) {
        customerMachineUpdateRotators.delete(String(machineId));
        box.innerHTML = "";
        return;
      }
      if (state.index >= state.updates.length) state.index = 0;
      renderMachineUpdateSlide(machineId);
    });
    box.querySelector("[data-open-customer-proforma]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      customerPdfAction(`/api/customer-portal/proformas/${encodeURIComponent(event.currentTarget.dataset.openCustomerProforma)}/download`, "view", "BELM-Proforma.pdf").catch((error) => alert(error.message));
    });
    box.querySelector("[data-view-all-communications]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      openCustomerCommunicationHistory(machineId, state.allUpdates);
    });
  }

  function ensureCustomerMachineUpdateTicker() {
    if (customerMachineUpdateRotationTimer) return;
    customerMachineUpdateRotationTimer = window.setInterval(() => {
      customerMachineUpdateRotators.forEach((state, machineId) => {
        const box = document.getElementById(`belmRecentUpdates-${machineId}`);
        if (!box) {
          customerMachineUpdateRotators.delete(machineId);
          return;
        }
        if (state.paused || state.updates.length <= 1) return;
        state.index = (state.index + 1) % state.updates.length;
        renderMachineUpdateSlide(machineId);
      });
    }, 5500);
  }

  async function loadCustomerMachineRecentUpdates(machineId, machine = null) {
    const box = document.getElementById(`belmRecentUpdates-${machineId}`);
    if (!box) return;
    try {
      const token = localStorage.getItem("belm_customer_token");
      const response = await fetch(`/api/customer-portal/machine-recent-updates/${encodeURIComponent(machineId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const allUpdates = await response.json();
      const dismissed = dismissedUpdateIds();
      const operationalUpdates = machineLiveSummaryUpdates(machine);
      const visibleUpdates = [...operationalUpdates, ...allUpdates]
        .filter((u) => !dismissed.has(String(u.id)))
        .slice(0, 10);
      if (!visibleUpdates.length) {
        customerMachineUpdateRotators.delete(String(machineId));
        box.innerHTML = "";
        return;
      }
      const state = {
        updates: visibleUpdates.slice(),
        allUpdates: visibleUpdates.slice(),
        index: 0,
        paused: false,
      };
      customerMachineUpdateRotators.set(String(machineId), state);
      box.onmouseenter = () => { state.paused = true; };
      box.onmouseleave = () => { state.paused = false; };
      box.onfocusin = () => { state.paused = true; };
      box.onfocusout = () => { state.paused = false; };
      renderMachineUpdateSlide(machineId);
      ensureCustomerMachineUpdateTicker();
    } catch (_) {
      const dismissed = dismissedUpdateIds();
      const fallbackUpdates = machineLiveSummaryUpdates(machine).filter((u) => !dismissed.has(String(u.id)));
      if (!fallbackUpdates.length) return;
      const state = { updates: fallbackUpdates.slice(), allUpdates: fallbackUpdates.slice(), index: 0, paused: false };
      customerMachineUpdateRotators.set(String(machineId), state);
      box.onmouseenter = () => { state.paused = true; };
      box.onmouseleave = () => { state.paused = false; };
      box.onfocusin = () => { state.paused = true; };
      box.onfocusout = () => { state.paused = false; };
      renderMachineUpdateSlide(machineId);
      ensureCustomerMachineUpdateTicker();
    }
  }

  function openCustomerCommunicationHistory(machineId, updates) {
    let dialog = document.getElementById("belmCustomerCommunicationDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "belmCustomerCommunicationDialog";
      dialog.className = "belm-analysis-dialog";
      dialog.innerHTML = `
        <div class="belm-analysis-dialog-card">
          <div class="belm-analysis-head">
            <span>MACHINE UPDATES &amp; BELM COMMUNICATION</span>
            <button type="button" class="belm-analysis-close" aria-label="Close">×</button>
          </div>
          <div id="belmCustomerCommunicationBody" class="belm-operator-reports-body"></div>
        </div>`;
      document.body.appendChild(dialog);
      dialog.querySelector(".belm-analysis-close").addEventListener("click", () => dialog.close());
    }
    const body = dialog.querySelector("#belmCustomerCommunicationBody");
    body.innerHTML = updates.length ? updates.map((u) => `
      <article class="belm-operator-report-row">
        <div class="belm-operator-report-head">
          <b>${escapeHtml(u.direction === "CUSTOMER_TO_BELM" || u.direction === "BELM_TO_CUSTOMER" ? customerCommunicationDirection(u.direction) : (u.typeLabel || "Machine update"))}</b>
          <span>${escapeHtml(u.channel || "PORTAL")}</span>
        </div>
        <p>${escapeHtml(u.text)}</p>
        <small>${escapeHtml(formatTanzaniaDateTime(u.createdAt))}</small>
        ${u.relatedType === "PROFORMA" && u.relatedId ? `<button type="button" class="belm-hide-request-button" data-history-proforma="${escapeHtml(u.relatedId)}" style="margin-top:8px">View Proforma PDF</button>` : ""}
      </article>`).join("") : '<p class="muted">No machine updates yet.</p>';
    body.querySelectorAll("[data-history-proforma]").forEach((button) => {
      button.addEventListener("click", () => customerPdfAction(`/api/customer-portal/proformas/${encodeURIComponent(button.dataset.historyProforma)}/download`, "view", "BELM-Proforma.pdf").catch((error) => alert(error.message)));
    });
    dialog.dataset.machineId = machineId;
    dialog.showModal();
  }

  let customerServiceStatusCache = {};

  async function loadServiceStatus(machineId) {
    if (customerServiceStatusCache[machineId]) return customerServiceStatusCache[machineId];
    const token = localStorage.getItem("belm_customer_token") || localStorage.getItem("belm_tech_token");
    if (!token) return null;
    try {
      const response = await fetch(`/api/customer-portal/machines/${encodeURIComponent(machineId)}/service-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const data = await response.json();
      customerServiceStatusCache[machineId] = data;
      return data;
    } catch (_) {
      return null;
    }
  }

  function whatsappShareUrl(text) {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  function customerWorkflowActor() {
    const payload = tokenPayload("belm_customer_token") || {};
    const roleName = String(payload.roleName || payload.role || "").toLowerCase();
    return roleName === "technician" ? "tech" : "customer";
  }

  function decorateMachineActionIcons(scope) {
    const iconMap = {
      "machine-expenses": "PR",
      "fuel-usage": "FL",
      "service-request": "SV",
      "report-problem": "!",
      "operator-reports": "OP",
      "check-up": "✓",
      "workflow": "WF",
    };
    scope.querySelectorAll("[data-belm-feature]").forEach((action) => {
      action.dataset.uiIcon = iconMap[action.dataset.belmFeature] || "→";
    });
  }

  function organizeMachineActions(panel) {
    const container = panel.querySelector(".belm-machine-quick-actions");
    if (!container) return;
    const visible = Array.from(container.children).filter((el) => el.style.display !== "none" && !el.hidden);
    if (visible.length <= 4) return;

    const role = customerRoleKey();
    const priorities = {
      workshop_manager: ["workflow", "check-up", "report-problem", "service-request"],
      store_keeper: ["machine-expenses", "workflow", "check-up", "service-request"],
      accounts: ["machine-expenses", "fuel-usage", "workflow", "service-request"],
      procurement: ["workflow", "machine-expenses", "service-request", "check-up"],
      technician: ["workflow", "check-up", "report-problem", "operator-reports"],
      operator: ["fuel-usage", "operator-reports", "report-problem", "check-up"],
      owner: ["workflow", "check-up", "machine-expenses", "service-request"],
      admin: ["workflow", "check-up", "machine-expenses", "service-request"],
    };
    const preferred = priorities[role] || priorities.owner;
    const ordered = visible.slice().sort((a, b) => {
      const ai = preferred.indexOf(a.dataset.belmFeature || "");
      const bi = preferred.indexOf(b.dataset.belmFeature || "");
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    ordered.slice(0, 4).forEach((el) => container.appendChild(el));
    const extras = ordered.slice(4);
    if (!extras.length) return;
    const more = document.createElement("details");
    more.className = "belm-machine-more-actions";
    more.innerHTML = '<summary>More actions <span>+</span></summary><div class="belm-machine-more-actions-grid"></div>';
    const grid = more.querySelector(".belm-machine-more-actions-grid");
    extras.forEach((el) => grid.appendChild(el));
    panel.appendChild(more);
  }

  async function customerServiceDuePanel(card, machine) {
    if (card.dataset.belmServiceDueReady === "1") return;
    card.dataset.belmServiceDueReady = "1";
    const [status, profile] = await Promise.all([loadServiceStatus(machine.id), loadCustomerPortalProfile()]);
    if (!status) return;
    const selfServiceMode = Boolean(profile?.isMachineryAdmin);
    const remaining = Math.round(status.hoursRemaining);
    const overdueBy = Math.max(0, Math.round(Math.abs(Math.min(0, status.hoursRemaining || 0))));
    const levelLabel = status.level === "RED" ? (overdueBy ? `OVERDUE BY ${overdueBy} HRS` : "DUE NOW") : status.level === "YELLOW" ? "DUE SOON" : "ON SCHEDULE";
    const serviceTypeLabel = status.serviceType || `${status.intervalHours}-Hour Service`;
    mergeMachineServiceLiveUpdate(machine.id, status);

    const panel = document.createElement("div");
    panel.className = `belm-service-due-panel status-${String(status.level || "GREEN").toLowerCase()}`;
    panel.innerHTML = `
      <div class="belm-service-due-head belm-service-due-head-v210">
        <div><span>SERVICE PLAN</span><b>${escapeHtml(serviceTypeLabel)}</b></div>
        <strong>${escapeHtml(levelLabel)}</strong>
      </div>
      <div class="belm-service-due-grid belm-service-due-grid-v210">
        <div><span>Current Hrs</span><b class="belm-current-hrs-value">${escapeHtml(Math.round(status.totalHours))}</b></div>
        <div><span>Next Service At</span><b>${escapeHtml(status.dueHour)} Hrs</b></div>
        <div><span>${remaining < 0 ? "Overdue By" : remaining === 0 ? "Service Due" : "Remaining"}</span><b>${remaining < 0 ? `${overdueBy} Hrs` : remaining === 0 ? "Now" : `${escapeHtml(remaining)} Hrs`}</b></div>
      </div>
      <div class="belm-machine-quick-actions">
        <a href="/customer-procurement/?machine=${encodeURIComponent(machine.id)}" data-belm-feature="machine-expenses">Procurement</a>
        <a href="/customer-fuel-usage/?machine=${encodeURIComponent(machine.id)}" data-belm-feature="fuel-usage">Fuel Usage</a>
        <a href="/customer-service-request/?machine=${encodeURIComponent(machine.id)}" data-belm-feature="service-request">${selfServiceMode ? "Spare & BELM Support" : "Spare & Service Request"}</a>
        <button type="button" class="belm-report-problem-button" data-belm-feature="report-problem" data-report-problem="${escapeHtml(machine.id)}">Report a Problem</button>
        <button type="button" class="belm-report-problem-button" data-belm-feature="operator-reports" data-view-operator-reports="${escapeHtml(machine.id)}">Operator Reports</button>
        <button type="button" class="belm-customer-checkup-button" data-belm-feature="check-up" data-customer-checkup="${escapeHtml(machine.id)}">Checkup Report</button>
        <a href="${customerWorkflowActor() === "tech" ? `/technician-job-cards/?machine=${encodeURIComponent(machine.id)}` : `/breakdown-workflow/?machine=${encodeURIComponent(machine.id)}&actor=${encodeURIComponent(customerWorkflowActor())}`}" data-belm-feature="workflow">${customerWorkflowActor() === "tech" ? "My Job Cards" : "Maintenance Process"}</a>
      </div>`;
    card.appendChild(panel);
    panel.addEventListener("click", (event) => event.stopPropagation());
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    panel.querySelector("[data-customer-checkup]")?.addEventListener("click", () => openCustomerCheckupDialog(machine));
    enforceCustomerFeaturePermissions(panel);
    decorateMachineActionIcons(panel);
    organizeMachineActions(panel);
  }


  function closeCustomerCheckupDialog() {
    document.getElementById("belmCustomerCheckupModal")?.remove();
  }

  function customerPdfFilename(disposition, fallback) {
    const match = String(disposition || "").match(/filename="?([^";]+)"?/i);
    return match ? match[1] : fallback;
  }

  async function customerPdfAction(url, mode, fallbackName) {
    const token = localStorage.getItem("belm_customer_token");
    if (!token) {
      window.location.href = "/portal/login";
      return;
    }
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Could not prepare the PDF.");
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const filename = customerPdfFilename(response.headers.get("Content-Disposition"), fallbackName || "BELM-checklist.pdf");

    if (mode === "download") {
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
      return;
    }

    if (mode === "print") {
      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.width = "1px";
      frame.style.height = "1px";
      frame.style.opacity = "0";
      frame.style.pointerEvents = "none";
      frame.src = objectUrl;
      frame.onload = () => {
        window.setTimeout(() => {
          try { frame.contentWindow?.print(); } catch (_) { window.open(objectUrl, "_blank", "noopener"); }
          window.setTimeout(() => {
            frame.remove();
            URL.revokeObjectURL(objectUrl);
          }, 30000);
        }, 300);
      };
      document.body.appendChild(frame);
      return;
    }

    const popup = window.open(objectUrl, "_blank", "noopener");
    if (!popup) {
      URL.revokeObjectURL(objectUrl);
      throw new Error("Allow pop-ups to view the checklist PDF.");
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }

  async function loadCustomerCheckedReport(reportId) {
    const token = localStorage.getItem("belm_customer_token");
    if (!token) {
      window.location.href = "/portal/login";
      return;
    }
    const response = await fetch(`/api/customer-portal/reports/${encodeURIComponent(reportId)}/view`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const report = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(report.error || "Could not load the checked report.");
    renderCheckedReport(report);
  }

  function renderDailyChecklistPanel(machine, data, body) {
    const templates = Array.isArray(data.templates) ? data.templates : [];
    if (!templates.length) {
      body.innerHTML = '<div class="belm-report-empty">No active Checklist Template is assigned to this machine type yet.</div>';
      return;
    }
    const machineName = [machine.brand, machine.model].filter(Boolean).join(" ") || machine.model || "Machine";
    const telemetry = data.telemetry || {};
    const displayPhoto = safeReportPhotoUrl(telemetry.displayPhotoUrl || "");
    const fuelLevel = String(telemetry.fuelLevel || "").trim();
    const displayCaptured = telemetry.capturedAt ? formatTanzaniaDateTime(telemetry.capturedAt) : "No display photo yet";
    body.innerHTML = `
      <div class="belm-checkup-display-strip">
        <div class="belm-checkup-display-photo-wrap">
          ${displayPhoto ? `<img src="${escapeHtml(displayPhoto)}" alt="Latest machine display" class="belm-checkup-display-thumb" data-checkup-display-photo>` : `<div class="belm-checkup-display-placeholder">DISPLAY PHOTO<br><small>Not captured yet</small></div>`}
        </div>
        <div class="belm-checkup-display-stat"><span>Hrs</span><strong>${escapeHtml(Number(telemetry.hourMeterReading || 0).toLocaleString("en-TZ"))}</strong></div>
        <div class="belm-checkup-display-stat"><span>Fuel Level</span><strong>${escapeHtml(fuelLevel || (displayPhoto ? "See display" : "—"))}</strong></div>
        <div class="belm-checkup-display-stat belm-checkup-display-time"><span>Display captured</span><strong>${escapeHtml(displayCaptured)}</strong></div>
      </div>
      <div class="belm-customer-checkup-toolbar">
        <label>Checklist Template
          <select data-daily-template-select>
            ${templates.map((template, index) => `<option value="${escapeHtml(template.id)}" ${index === 0 ? "selected" : ""}>${escapeHtml(template.name)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div data-daily-template-body></div>`;

    const select = body.querySelector("[data-daily-template-select]");
    const templateBody = body.querySelector("[data-daily-template-body]");
    const renderTemplate = () => {
      const template = templates.find((item) => String(item.id) === String(select.value)) || templates[0];
      const items = Array.isArray(template.items) ? template.items : [];
      const todayReport = template.todayReport || null;
      templateBody.innerHTML = `
        <div class="belm-daily-checklist-summary">
          <div><span>Machine</span><strong>${escapeHtml(machineName)}</strong></div>
          <div><span>Checklist</span><strong>${escapeHtml(template.name)}</strong></div>
          <div><span>Today</span><strong>${todayReport ? "Checked" : "Pending"}</strong></div>
          <div><span>Template Sync</span><strong>Live</strong></div>
        </div>
        ${todayReport ? `<div class="belm-daily-checklist-complete">Today's checklist has already been completed by ${escapeHtml(todayReport.filledBy || "Technician")} at ${escapeHtml(formatTanzaniaDateTime(todayReport.createdAt))}.</div>` : '<div class="belm-daily-checklist-pending">This is today\'s checklist generated from the current Checklist Template.</div>'}
        <div class="belm-daily-checklist-items">
          ${items.length ? items.map((item, index) => `<div class="belm-daily-checklist-item"><b>${index + 1}. ${escapeHtml(item.label)}</b><span>${escapeHtml(item.inputType || "TEXT")}${item.isRequired ? " · Required" : ""}</span></div>`).join("") : '<div class="belm-report-empty">This template has no checklist items.</div>'}
        </div>
        <div class="belm-customer-checkup-pdf-actions">
          <button type="button" data-template-pdf="view">View PDF</button>
          <button type="button" data-template-pdf="download">Download PDF</button>
          <button type="button" data-template-pdf="print">Print PDF</button>
          ${todayReport ? '<button type="button" class="primary" data-view-today-report>View Checked Report</button>' : ""}
        </div>`;
      templateBody.querySelectorAll("[data-template-pdf]").forEach((button) => {
        button.addEventListener("click", async () => {
          const originalText = button.textContent;
          button.disabled = true;
          button.textContent = "Preparing…";
          try {
            await customerPdfAction(
              `/api/customer-portal/machines/${encodeURIComponent(machine.id)}/daily-checklist-pdf?templateId=${encodeURIComponent(template.id)}`,
              button.dataset.templatePdf,
              `BELM-daily-checklist-${machine.id}.pdf`
            );
          } catch (error) {
            alert(error.message || "Could not prepare the daily checklist PDF.");
          } finally {
            button.disabled = false;
            button.textContent = originalText;
          }
        });
      });
      templateBody.querySelector("[data-view-today-report]")?.addEventListener("click", async () => {
        try { await loadCustomerCheckedReport(todayReport.id); }
        catch (error) { alert(error.message || "Could not load today's checked report."); }
      });
    };
    body.querySelector("[data-checkup-display-photo]")?.addEventListener("click", () => openReportPhotoLightbox(displayPhoto));
    select.addEventListener("change", renderTemplate);
    renderTemplate();
  }

  async function showCustomerDailyChecklist(machine, body) {
    body.innerHTML = '<p class="belm-analysis-loading">Loading today\'s Checklist Template…</p>';
    const token = localStorage.getItem("belm_customer_token");
    try {
      const response = await fetch(`/api/customer-portal/machines/${encodeURIComponent(machine.id)}/daily-checklist`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load the daily checklist.");
      renderDailyChecklistPanel(machine, data, body);
    } catch (error) {
      body.innerHTML = `<p class="belm-analysis-error">${escapeHtml(error.message || "Could not load the daily checklist.")}</p>`;
    }
  }

  // V273 - shared date/month/year filter bar + PDF download, used by
  // both "Job Card Reports" and "Daily Report" tabs. These records are
  // never deleted or hidden by anything on this page - this is purely a
  // read/export view on top of data that already stays permanently
  // (see the Forget-Permanently audit in V266 for the one deliberate
  // exception, which only ever runs when a whole account is removed).
  function belmDateFilterBarHtml(prefix) {
    return `<div class="belm-report-date-filter">
      <label>Mode
        <select data-${prefix}-mode>
          <option value="all">All time</option>
          <option value="day">Specific date</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="range">Custom range</option>
        </select>
      </label>
      <label class="hidden" data-${prefix}-field="day">Date<input type="date" data-${prefix}-day></label>
      <label class="hidden" data-${prefix}-field="month">Month<input type="month" data-${prefix}-month></label>
      <label class="hidden" data-${prefix}-field="year">Year<input type="number" min="2000" max="2100" step="1" placeholder="e.g. 2026" data-${prefix}-year></label>
      <label class="hidden" data-${prefix}-field="range">From<input type="date" data-${prefix}-from></label>
      <label class="hidden" data-${prefix}-field="range">To<input type="date" data-${prefix}-to></label>
      <button type="button" data-${prefix}-apply>Apply</button>
      <button type="button" class="belm-report-date-download" data-${prefix}-download>⭳ Download PDF</button>
    </div>`;
  }
  function wireBelmDateFilterBar(container, prefix, onChange) {
    const modeSelect = container.querySelector(`[data-${prefix}-mode]`);
    const syncFields = () => {
      container.querySelectorAll(`[data-${prefix}-field]`).forEach((field) => {
        field.classList.toggle("hidden", field.dataset[`${prefix}Field`] !== modeSelect.value);
      });
    };
    modeSelect.addEventListener("change", syncFields);
    syncFields();
    const readRange = () => {
      const mode = modeSelect.value;
      if (mode === "day") { const v = container.querySelector(`[data-${prefix}-day]`).value; return { from: v, to: v }; }
      if (mode === "month") { const v = container.querySelector(`[data-${prefix}-month]`).value; return { from: v, to: v }; }
      if (mode === "year") { const v = container.querySelector(`[data-${prefix}-year]`).value; return { from: v, to: v }; }
      if (mode === "range") return { from: container.querySelector(`[data-${prefix}-from]`).value, to: container.querySelector(`[data-${prefix}-to]`).value };
      return { from: "", to: "" };
    };
    container.querySelector(`[data-${prefix}-apply]`).addEventListener("click", () => onChange(readRange()));
    return { readRange };
  }

  async function showCustomerJobCardReports(machine, body) {
    body.innerHTML = `${belmDateFilterBarHtml("jc")}<div class="belm-customer-report-list"><p class="belm-analysis-loading">Loading job card reports…</p></div>`;
    const token = localStorage.getItem("belm_customer_token");
    const list = body.querySelector(".belm-customer-report-list");
    async function render(range) {
      list.innerHTML = '<p class="belm-analysis-loading">Loading job card reports…</p>';
      try {
        const qs = new URLSearchParams();
        if (range?.from) qs.set("from", range.from);
        if (range?.to) qs.set("to", range.to);
        const response = await fetch(`/api/customer-portal/machines/${encodeURIComponent(machine.id)}/job-cards${qs.toString() ? `?${qs}` : ""}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const jobCards = await response.json().catch(() => []);
        if (!response.ok) throw new Error(jobCards.error || "Could not load Job Card reports.");
        list.innerHTML = Array.isArray(jobCards) && jobCards.length ? jobCards.map((jc) => `
          <article class="belm-customer-checkup-report-row">
            <div>
              <strong>${escapeHtml(jc.jobCardNo || jc.job_card_no || "Job Card")}</strong>
              <span>${escapeHtml(jc.title || "")}</span>
              <small>${escapeHtml(jc.technicianName || jc.technician_name || "Unassigned")} · ${escapeHtml(formatTanzaniaDateTime(jc.createdAt || jc.created_at))}</small>
            </div>
            <span class="belm-report-status status-${String(jc.status || "").toLowerCase()}">${escapeHtml(jc.status || "")}</span>
          </article>`).join("") : '<div class="belm-report-empty">No Job Card reports found for this period. Nothing is ever deleted — try widening the date range or switch to All time.</div>';
      } catch (error) {
        list.innerHTML = `<p class="belm-analysis-error">${escapeHtml(error.message || "Could not load Job Card reports.")}</p>`;
      }
    }
    const { readRange } = wireBelmDateFilterBar(body, "jc", render);
    body.querySelector("[data-jc-download]").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Preparing…";
      try {
        const range = readRange();
        const qs = new URLSearchParams();
        if (range.from) qs.set("from", range.from);
        if (range.to) qs.set("to", range.to);
        await customerPdfAction(
          `/api/customer-portal/machines/${encodeURIComponent(machine.id)}/job-cards-pdf${qs.toString() ? `?${qs}` : ""}`,
          "download",
          "BELM-job-card-history.pdf"
        );
      } catch (error) {
        alert(error.message || "Could not prepare the Job Card PDF.");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
    render(null);
  }

  async function showCustomerDailyReportHistory(machine, body) {
    body.innerHTML = `${belmDateFilterBarHtml("dr")}<div class="belm-customer-report-list"><p class="belm-analysis-loading">Loading daily reports…</p></div>`;
    const token = localStorage.getItem("belm_customer_token");
    const list = body.querySelector(".belm-customer-report-list");
    async function render(range) {
      list.innerHTML = '<p class="belm-analysis-loading">Loading daily reports…</p>';
      try {
        const response = await fetch(`/api/customer-portal/machines/${encodeURIComponent(machine.id)}/reports`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const reports = await response.json().catch(() => []);
        if (!response.ok) throw new Error(reports.error || "Could not load daily reports.");
        const from = range?.from ? new Date(range.from.length === 4 ? `${range.from}-01-01` : range.from.length === 7 ? `${range.from}-01` : range.from) : null;
        const to = range?.to ? new Date(range.to.length === 4 ? `${range.to}-12-31T23:59:59` : range.to.length === 7 ? `${range.to}-28T23:59:59` : `${range.to}T23:59:59`) : null;
        const filtered = (Array.isArray(reports) ? reports : []).filter((r) => {
          if (!from && !to) return true;
          const created = new Date(r.createdAt);
          if (from && created < from) return false;
          if (to && created > to) return false;
          return true;
        });
        list.innerHTML = filtered.length ? filtered.map((report) => {
          const status = String(report.overallStatus || "GREEN").toUpperCase();
          return `<article class="belm-customer-checkup-report-row">
            <div>
              <strong>${escapeHtml(report.templateName || "Daily Report")}</strong>
              <span>${escapeHtml(report.createdAt ? formatTanzaniaDateTime(report.createdAt) : "Date not recorded")}</span>
              <small>Technician: ${escapeHtml(report.filledBy || "Not recorded")} · Hour meter: ${escapeHtml(report.hourMeterReading ?? "—")}</small>
            </div>
            <span class="belm-report-status status-${escapeHtml(status.toLowerCase())}">${escapeHtml(status)}</span>
          </article>`;
        }).join("") : '<div class="belm-report-empty">No daily reports found for this period. Nothing is ever deleted — try widening the date range or switch to All time.</div>';
      } catch (error) {
        list.innerHTML = `<p class="belm-analysis-error">${escapeHtml(error.message || "Could not load daily reports.")}</p>`;
      }
    }
    const { readRange } = wireBelmDateFilterBar(body, "dr", render);
    body.querySelector("[data-dr-download]").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Preparing…";
      try {
        const range = readRange();
        const qs = new URLSearchParams();
        if (range.from) qs.set("from", range.from);
        if (range.to) qs.set("to", range.to);
        await customerPdfAction(
          `/api/customer-portal/machines/${encodeURIComponent(machine.id)}/reports-pdf${qs.toString() ? `?${qs}` : ""}`,
          "download",
          "BELM-daily-report-history.pdf"
        );
      } catch (error) {
        alert(error.message || "Could not prepare the Daily Report PDF.");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
    render(null);
  }

  async function showCustomerCheckedReports(machine, body) {
    body.innerHTML = '<p class="belm-analysis-loading">Loading checked reports…</p>';
    const token = localStorage.getItem("belm_customer_token");
    try {
      const response = await fetch(`/api/customer-portal/machines/${encodeURIComponent(machine.id)}/reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const reports = await response.json().catch(() => []);
      if (!response.ok) throw new Error(reports.error || "Could not load checked reports.");
      body.innerHTML = Array.isArray(reports) && reports.length ? reports.map((report) => {
        const status = String(report.overallStatus || "GREEN").toUpperCase();
        return `<article class="belm-customer-checkup-report-row">
          <div>
            <strong>${escapeHtml(report.templateName || "Checked Report")}</strong>
            <span>${escapeHtml(report.createdAt ? formatTanzaniaDateTime(report.createdAt) : "Date not recorded")}</span>
            <small>Technician: ${escapeHtml(report.filledBy || "Not recorded")} · Hour meter: ${escapeHtml(report.hourMeterReading ?? "—")}</small>
          </div>
          <span class="belm-report-status status-${escapeHtml(status.toLowerCase())}">${escapeHtml(status)}</span>
          <div class="belm-customer-report-actions">
            <button type="button" data-report-view="${escapeHtml(report.id)}">View Checked Report</button>
            <button type="button" data-report-pdf="view" data-report-id="${escapeHtml(report.id)}">View PDF</button>
            <button type="button" data-report-pdf="download" data-report-id="${escapeHtml(report.id)}">Download PDF</button>
            <button type="button" data-report-pdf="print" data-report-id="${escapeHtml(report.id)}">Print PDF</button>
          </div>
        </article>`;
      }).join("") : '<div class="belm-report-empty">No checked reports have been saved for this machine yet.</div>';

      body.querySelectorAll("[data-report-view]").forEach((button) => button.addEventListener("click", async () => {
        try { await loadCustomerCheckedReport(button.dataset.reportView); }
        catch (error) { alert(error.message || "Could not load the checked report."); }
      }));
      body.querySelectorAll("[data-report-pdf]").forEach((button) => button.addEventListener("click", async () => {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Preparing…";
        try {
          await customerPdfAction(
            `/api/customer-portal/reports/${encodeURIComponent(button.dataset.reportId)}/download`,
            button.dataset.reportPdf,
            `BELM-checklist-${button.dataset.reportId}.pdf`
          );
        } catch (error) {
          alert(error.message || "Could not prepare the report PDF.");
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      }));
    } catch (error) {
      body.innerHTML = `<p class="belm-analysis-error">${escapeHtml(error.message || "Could not load checked reports.")}</p>`;
    }
  }

  function openCustomerCheckupDialog(machine) {
    closeCustomerCheckupDialog();
    const machineName = [machine.brand, machine.model].filter(Boolean).join(" ") || machine.model || "Machine";
    const modal = document.createElement("div");
    modal.id = "belmCustomerCheckupModal";
    modal.className = "belm-checked-report-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `<section class="belm-checked-report-card belm-customer-checkup-card">
      <header class="belm-checked-report-head">
        <div>
          <p>BELM machine check-up</p>
          <h2>${escapeHtml(machineName)}</h2>
          <span>${escapeHtml(machine.machineType || machine.machine_type || "")} · ${escapeHtml(machine.serialNumber || machine.serial_number || machine.regNumber || machine.reg_number || "No serial recorded")}</span>
        </div>
        <button type="button" data-close-customer-checkup aria-label="Close Check Up">×</button>
      </header>
      <nav class="belm-customer-checkup-tabs">
        <button type="button" class="active" data-checkup-tab="daily">Checklist ya Siku</button>
        <button type="button" data-checkup-tab="reports">Checked Reports</button>
        <button type="button" data-checkup-tab="jobcards">Job Card Reports</button>
        <button type="button" data-checkup-tab="dailyreport">Daily Report</button>
      </nav>
      <div class="belm-customer-checkup-body" data-customer-checkup-body></div>
    </section>`;
    const body = modal.querySelector("[data-customer-checkup-body]");
    const setTab = (name) => {
      modal.querySelectorAll("[data-checkup-tab]").forEach((button) => button.classList.toggle("active", button.dataset.checkupTab === name));
      if (name === "reports") showCustomerCheckedReports(machine, body);
      else if (name === "jobcards") showCustomerJobCardReports(machine, body);
      else if (name === "dailyreport") showCustomerDailyReportHistory(machine, body);
      else showCustomerDailyChecklist(machine, body);
    };
    modal.querySelectorAll("[data-checkup-tab]").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.checkupTab)));
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-close-customer-checkup]")) closeCustomerCheckupDialog();
    });
    document.body.appendChild(modal);
    setTab("daily");
  }

  // A leaner version of customerServiceDuePanel for the Technician view —
  // same NEXT SERVICE info grid (Fleet Number, Type of Service, Current
  // Hrs, Remaining Hrs), but without the customer-facing action buttons
  // row (Assign Users, Request Service, etc.) since the Technician already
  // has their own Checked Reports / Check-up buttons on this same card.
  async function technicianServiceDuePanel(card, machine) {
    if (card.dataset.belmServiceDueReady === "1") return;
    card.dataset.belmServiceDueReady = "1";
    const status = await loadServiceStatus(machine.id);
    if (!status) return;

    const serial = machine.serialNumber || machine.serial_number || machine.regNumber || machine.reg_number || "No serial recorded";
    const remaining = Math.round(status.hoursRemaining);
    const overdueBy = Math.max(0, Math.round(Math.abs(Math.min(0, status.hoursRemaining || 0))));
    const levelLabel = status.level === "RED" ? (overdueBy ? `OVERDUE BY ${overdueBy} HRS` : "DUE NOW") : status.level === "YELLOW" ? "DUE SOON" : "ON SCHEDULE";
    const serviceTypeLabel = status.serviceType || `${status.intervalHours}-Hour Service`;

    const panel = document.createElement("div");
    panel.className = `belm-service-due-panel status-${String(status.level || "GREEN").toLowerCase()}`;
    panel.innerHTML = `
      <div class="belm-service-due-head">
        <span>NEXT SERVICE</span>
        <strong>${escapeHtml(levelLabel)}</strong>
      </div>
      <div class="belm-service-due-grid">
        <div><span>Fleet Number</span><b class="belm-fleet-number-value">${escapeHtml(machine.fleetNumber || machine.fleet_number || serial)}</b></div>
        <div><span>Type of Service</span><b>${escapeHtml(serviceTypeLabel)}</b></div>
        <div><span>Current Hrs</span><b class="belm-current-hrs-value">${escapeHtml(Math.round(status.totalHours))}</b></div>
        <div><span>Next Service At</span><b>${escapeHtml(status.dueHour)} Hrs</b></div>
        <div><span>Service Status</span><b>${escapeHtml(levelLabel)}</b></div>
        <div><span>${remaining < 0 ? "Overdue By" : remaining === 0 ? "Service Due" : "Remaining Hrs"}</span><b>${remaining < 0 ? `${overdueBy} Hrs` : remaining === 0 ? "Now" : escapeHtml(remaining)}</b></div>
      </div>
      <button type="button" class="belm-technician-operator-reports-button" data-view-operator-reports="${escapeHtml(machine.id)}" data-technician-context="1">Operator Reports</button>`;
    // Insert before the Checked Reports/Check-up buttons row (which is
    // created synchronously right after this call) rather than just
    // appending, so the NEXT SERVICE panel reliably lands between Activity
    // Status and the buttons regardless of how long this fetch takes.
    const actionsRowRef = card.querySelector(".belm-technician-card-actions");
    card.insertBefore(panel, actionsRowRef);
  }

  let techLoadingWatchdogScheduled = false;
  // Detects the specific "your assigned customer has changed" 401 the
  // backend now sends when a Technician's session token is stale (their
  // assigned customer was deleted/merged/reassigned after they logged
  // in). Without this, the app just silently retries the same broken
  // request forever and the person is stuck on "Loading…" no matter how
  // many times they hit Refresh — only a fresh login fixes it, so do
  // that automatically instead of making them find "Log in again".
  function installStaleTechSessionDetector() {
    if (window.location.pathname !== "/tech") return;
    if (window.__belmStaleTechDetectorInstalled) return;
    window.__belmStaleTechDetectorInstalled = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        if (response.status === 401 || response.status === 403) {
          const clone = response.clone();
          const text = await clone.text();
          const assignmentChanged = text.includes("assigned customer has changed");
          const selfServiceOff = text.includes("BELM Service Provider is active for this customer") || text.includes("Customer Self-Service is currently OFF");
          if ((assignmentChanged || selfServiceOff) && !document.getElementById("belm-tech-session-notice")) {
            const banner = document.createElement("div");
            banner.id = "belm-tech-session-notice";
            banner.style.cssText =
              "position:fixed;left:16px;right:16px;top:16px;z-index:99999;display:flex;align-items:center;justify-content:space-between;gap:14px;" +
              "background:#101b31;color:#fff;border:1px solid #31527a;border-radius:12px;padding:14px 16px;box-shadow:0 12px 36px rgba(0,0,0,.28);font:600 13px Inter,system-ui,sans-serif;";
            banner.innerHTML = selfServiceOff
              ? '<span><b>BELM Service Provider is active.</b> Customer Technician maintenance access is paused. Your login has been kept active.</span><button type="button" data-close-tech-session-notice style="padding:7px 11px;border:1px solid #58799f;border-radius:8px;background:#162944;color:#fff;font-weight:800;cursor:pointer;">OK</button>'
              : '<span><b>Assignment changed.</b> The system is refreshing your session automatically; your login has not been deleted.</span><button type="button" data-tech-session-reload style="padding:7px 11px;border:0;border-radius:8px;background:#2f7cf5;color:#fff;font-weight:800;cursor:pointer;">Refresh page</button>';
            document.body.appendChild(banner);
            banner.querySelector("[data-close-tech-session-notice]")?.addEventListener("click", () => banner.remove());
            banner.querySelector("[data-tech-session-reload]")?.addEventListener("click", () => window.location.reload());
          }
        }
      } catch (_) {}
      return response;
    };
  }

  function watchForStuckTechLoading() {
    if (window.location.pathname !== "/tech") return;
    if (techLoadingWatchdogScheduled) return;
    techLoadingWatchdogScheduled = true;
    const isStuck = () => {
      const loadingNode = Array.from(document.querySelectorAll("div"))
        .find(el => el.children.length === 0 && (el.textContent || "").trim() === "Loading…");
      return !!loadingNode && !document.getElementById("belm-stuck-loading-banner");
    };
    setTimeout(() => {
      techLoadingWatchdogScheduled = false;
      if (!isStuck()) return;
      const banner = document.createElement("div");
      banner.id = "belm-stuck-loading-banner";
      banner.style.cssText =
        "position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;padding:14px 16px;" +
        "border-radius:12px;background:#fff3f1;border:1px solid #f1c8c4;color:#b3261e;" +
        "font:600 13px Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:space-between;gap:10px;" +
        "box-shadow:0 10px 30px rgba(0,0,0,.15);";
      banner.innerHTML =
        '<span>This is taking longer than expected. Your session may have expired.</span>' +
        '<span style="display:flex;gap:8px;flex-shrink:0;">' +
        '<button type="button" id="belm-stuck-retry" style="padding:8px 14px;border:0;border-radius:8px;background:#101b31;color:#fff;font-weight:800;cursor:pointer;">Refresh</button>' +
        '<button type="button" id="belm-stuck-relogin" style="padding:8px 14px;border:1px solid #b3261e;border-radius:8px;background:#fff;color:#b3261e;font-weight:800;cursor:pointer;">Log in again</button>' +
        '</span>';
      document.body.appendChild(banner);
      document.getElementById("belm-stuck-retry").addEventListener("click", () => window.location.reload());
      document.getElementById("belm-stuck-relogin").addEventListener("click", () => {
        localStorage.removeItem("belm_tech_token");
        localStorage.removeItem("belm_tech_user");
        window.location.reload();
      });
    }, 8000);
  }

  function checkedTodayKey() {
    const today = new Date().toISOString().slice(0, 10);
    return `belm_tech_checked_today_${today}`;
  }

  function getCheckedTodayList() {
    try {
      return JSON.parse(sessionStorage.getItem(checkedTodayKey()) || "[]");
    } catch {
      return [];
    }
  }

  function installTechChecklistSubmitInterceptor() {
    if (window.__belmFetchPatched) return;
    window.__belmFetchPatched = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
        const method = (args[1]?.method || "GET").toUpperCase();
        if (response.ok && method === "POST" && url.includes("/api/checklist-reports") && !url.includes("action=")) {
          response.clone().json().then((data) => {
            const serial = data?.machine?.serialNumber;
            if (!serial) return;
            const list = getCheckedTodayList();
            if (!list.includes(serial)) {
              list.push(serial);
              sessionStorage.setItem(checkedTodayKey(), JSON.stringify(list));
            }
          }).catch(() => {});
        }
      } catch (_) {}
      return response;
    };
  }

  function hideCheckedMachinesFromTechList() {
    if (window.location.pathname !== "/tech") return;
    const checked = getCheckedTodayList();
    if (!checked.length) return;
    document.querySelectorAll(".grid button").forEach((card) => {
      const text = card.textContent || "";
      if (checked.some((serial) => text.includes(serial)) && card.style.display !== "none") {
        card.style.display = "none";
        const note = document.createElement("p");
        note.textContent = "✅ Already checked today — hidden from this list.";
        note.style.cssText = "grid-column:1/-1;margin:4px 0;padding:8px;background:#eaf8f0;color:#075f36;border-radius:8px;font-size:12px;font-weight:700;text-align:center;";
        note.dataset.belmCheckedNote = "1";
        if (!card.previousElementSibling?.dataset?.belmCheckedNote) {
          card.insertAdjacentElement("beforebegin", note);
        }
      }
    });
  }

  function addCustomerNameToMachinesHeading() {
    if (window.location.pathname !== "/portal/dashboard") return;
    const heading = Array.from(document.querySelectorAll("h1, h2"))
      .find(element => (element.textContent || "").trim() === "Your machines");
    if (!heading || heading.dataset.belmNamed === "1") return;
    const payload = tokenPayload("belm_customer_token");
    const name = payload?.name;
    if (!name) return;
    heading.dataset.belmNamed = "1";
    heading.textContent = `${String(name).toUpperCase()} ${belmT("MACHINES")}`;
  }

  // V289 - a role-specific screen must name the actual company instead of
  // showing the generic word CUSTOMER. Customer portal uses the JWT company
  // name; Technician workspace uses the Technician's assigned company name.
  function roleContextCustomerName() {
    if (window.location.pathname.startsWith("/portal")) {
      return String(tokenPayload("belm_customer_token")?.name || "").trim();
    }
    if (window.location.pathname.startsWith("/tech")) {
      try {
        const tech = JSON.parse(localStorage.getItem("belm_tech_user") || "{}");
        return String(tech.assignedCustomerName || "").trim();
      } catch (_) { return ""; }
    }
    return "";
  }

  function replaceGenericCustomerLabels(root = document.body) {
    const companyName = roleContextCustomerName();
    if (!companyName || !root) return;
    const upperName = companyName.toUpperCase();
    const replaceText = (value) => {
      let text = String(value || "");
      if (!/\bcustomer\b/i.test(text)) return text;
      if (text.includes(companyName) || text.includes(upperName)) return text;
      text = text.replace(/\bCUSTOMER\b/g, upperName);
      text = text.replace(/\bCustomer\b/g, companyName);
      text = text.replace(/\bcustomer\b/g, companyName);
      return text;
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (!parent || parent.closest("script,style,noscript,textarea,code,pre")) return;
      const next = replaceText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    });
    root.querySelectorAll?.("[title],[aria-label],[placeholder]").forEach((element) => {
      ["title", "aria-label", "placeholder"].forEach((attr) => {
        if (!element.hasAttribute(attr)) return;
        const value = element.getAttribute(attr);
        const next = replaceText(value);
        if (next !== value) element.setAttribute(attr, next);
      });
    });
  }

  // A sticky "Activity Overview" card, styled like the dark Petty Cash
  // Balance card, placed right under the heading/"Manage assistants" row
  // and above the machine grid. Stays in view while the machine list
  // below it scrolls — a quick-glance summary of what's happening across
  // every machine, not tied to any one of them.
  let belmOverviewInsertInFlight = false;
  async function insertCustomerActivityOverview() {
    if (isCustomerOperatorRole()) return;
    if (window.location.pathname !== "/portal/dashboard") return;
    if (document.getElementById("belmActivityOverviewCard")) return;
    // V241 - this function awaits up to ~3s (machineGrid poll below) before
    // it actually creates+inserts the card with this id. The dashboard's
    // setInterval re-runs every 1.5s, so a second call could sail past the
    // getElementById guard above (the id doesn't exist yet) while the first
    // call is still waiting, and both would go on to insert a full duplicate
    // card. This synchronous flag closes that race - only one call may be
    // "in flight" building the card at a time.
    if (belmOverviewInsertInFlight) return;
    belmOverviewInsertInFlight = true;
    try {
      await insertCustomerActivityOverviewInner();
    } finally {
      belmOverviewInsertInFlight = false;
    }
  }
  async function insertCustomerActivityOverviewInner() {
    const heading = Array.from(document.querySelectorAll("h1, h2"))
      .find(element => (element.textContent || "").trim().endsWith("MACHINES") || (element.textContent || "").trim() === "Your machines");
    if (!heading) return;
    // Walk up to the original dashboard heading/action row. The native
    // + Add user button is intentionally hidden, but it remains a reliable
    // DOM anchor for placing the Activity Overview / MORE TOOLS stack.
    let rowContainer = heading.parentElement;
    for (let level = 0; level < 4 && rowContainer; level++) {
      if (rowContainer.querySelector("[data-belm-native-add-user='1']") ||
          Array.from(rowContainer.querySelectorAll("button, a")).some(el => ["+ Add user", "+ Manage assistants"].includes((el.textContent || "").trim()))) break;
      rowContainer = rowContainer.parentElement;
    }
    if (!rowContainer || !rowContainer.parentElement) return;

    // enhanceCustomerMachineExpenseCards() runs concurrently (not
    // awaited) and marks the machine grid asynchronously — give it a
    // short window to finish so the sidebar layout below can find it,
    // rather than always falling back to the plain top-bar placement.
    let machineGrid = document.querySelector(".belm-customer-machine-grid");
    for (let attempt = 0; !machineGrid && attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 150));
      machineGrid = document.querySelector(".belm-customer-machine-grid");
    }

    const card = document.createElement("div");
    card.id = "belmActivityOverviewCard";
    card.className = "belm-activity-overview-card";
    card.innerHTML = `
      <div class="belm-activity-overview-head">${belmT("ACTION CENTER")}</div>
      <p class="belm-action-center-intro">${belmT("What needs attention now across your machines.")}</p>
      <div class="belm-activity-overview-grid" id="belmActivityOverviewGrid">
        <p class="belm-activity-overview-loading">Loading...</p>
      </div>
      <details class="belm-action-center-snapshot" id="belmActionCenterSnapshot">
        <summary>${belmT("Business snapshot")} <span>+</span></summary>
        <div class="belm-action-center-snapshot-grid" id="belmActionCenterSnapshotGrid"></div>
      </details>
      <div class="belm-activity-overview-machines" id="belmActivityOverviewMachines"></div>`;

    // V227 - Status / Petty Cash / Breakdown Process used to be three
    // separate floating cards, which reads as visual clutter once a
    // customer has several machines. They now live inside one shared
    // card (belmOverviewCard) as internal sections separated by a thin
    // divider, so there is a single card border/shadow no matter how
    // many machines exist.
    const overviewCard = document.createElement("div");
    overviewCard.id = "belmOverviewCard";
    overviewCard.className = "belm-overview-card";
    const pettyCashCard = document.createElement("div");
    pettyCashCard.id = "belmPettyCashAccountCard";
    pettyCashCard.className = "belm-petty-cash-account-card";
    pettyCashCard.setAttribute("data-belm-feature", "machine-expenses");
    pettyCashCard.innerHTML = `
      <div class="belm-petty-cash-head"><span>${belmT("PETTY CASH")}</span><a href="/customer-petty-cash/">${belmT("Open account")}</a></div>
      <strong id="belmPettyCashBalance">TZS —</strong>
      <div class="belm-petty-cash-meta"><span>${belmT("Used")} <b id="belmPettyCashUsed">—</b></span><span>${belmT("Top-up")} <b id="belmPettyCashTopup">—</b></span></div>`;

    const breakdownCard = document.createElement("a");
    breakdownCard.id = "belmBreakdownProcessRailCard";
    breakdownCard.className = "belm-email-report-button belm-maintenance-process-button";
    breakdownCard.href = `/breakdown-workflow/?actor=${encodeURIComponent(customerWorkflowActor())}`;
    breakdownCard.setAttribute("data-belm-feature", "workflow");
    breakdownCard.innerHTML = `
      ${belmT("MAINTENANCE PROCESS")}
      <small>${belmT("Live delays, approvals & Job Cards")}</small>`;

    const toolsCard = document.createElement("div");
    toolsCard.id = "belmAccountToolsCard";
    toolsCard.className = "belm-account-tools-card";
    toolsCard.innerHTML = `
      <div class="belm-account-tools-head">${belmT("MORE TOOLS")}</div>
      <div class="belm-account-tools-actions">
        <button type="button" class="belm-email-report-button belm-user-manager-button" data-belm-owner-admin-only data-belm-feature="assign-users" data-open-role-manager>
          ${belmT("+USER")}
          <small>${belmT("Role Manager & Dashboard Access")}</small>
        </button>
        <button type="button" class="belm-email-report-button belm-privacy-button" data-belm-owner-admin-only data-open-privacy>
          ${belmT("Privacy & BELM Access")}
          <small>${belmT("Choose what internal company data BELM may access")}</small>
        </button>
        <span data-belm-maintenance-process-slot></span>
        <button type="button" class="belm-email-report-button" data-belm-feature="service-request" data-contact-belm-support>
          ${belmT("Request BELM Support")}
        </button>
        <button type="button" class="belm-email-report-button" data-belm-feature="email" data-email-report
          data-report-subject="BELM Portal — account activity report"
          data-report-message="BELM Portal account report requested from the dashboard.">
          ${belmT("Management Email")}
        </button>
        <button type="button" class="belm-email-report-button belm-general-analysis-button" data-open-general-analysis>
          ${belmT("General Analysis")}
          <small>${belmT("Full breakdown of your fleet & activity")}</small>
        </button>
        <button type="button" class="belm-email-report-button belm-updates-button" id="belmUpdatesButton" data-open-belm-updates>
          ${belmT("UPDATE")}
          <small>${belmT("BELM, Technician & machine activity")}</small>
        </button>
      </div>`;
    toolsCard.querySelector("[data-belm-maintenance-process-slot]")?.replaceWith(breakdownCard);
    enforceCustomerFeaturePermissions(toolsCard);
    toolsCard.querySelector("[data-open-role-manager]")?.addEventListener("click", () => { window.location.href = "/customer-users/"; });
    toolsCard.querySelector("[data-open-privacy]")?.addEventListener("click", () => openCustomerPrivacyDialog());
    toolsCard.querySelector("[data-contact-belm-support]")?.addEventListener("click", () => openBelmSupportDialog());
    toolsCard.querySelector("[data-open-general-analysis]")?.addEventListener("click", () => openCustomerGeneralAnalysisDialog());
    toolsCard.querySelector("[data-open-belm-updates]")?.addEventListener("click", () => openCustomerUpdatesDialog());
    const syncPettyCashVisibility = () => {
      const payload = tokenPayload("belm_customer_token");
      const permissions = customerCurrentPermissions !== undefined ? customerCurrentPermissions : payload?.permissions;
      pettyCashCard.style.display = Array.isArray(permissions) && !permissions.includes("machine-expenses") ? "none" : "";
      breakdownCard.style.display = Array.isArray(permissions) && !permissions.includes("workflow") ? "none" : "";
    };
    syncPettyCashVisibility();

    loadCustomerPortalProfile().then((profile) => {
      enforceCustomerFeaturePermissions(toolsCard);
      syncPettyCashVisibility();
      const hasVisibleTool = [...toolsCard.querySelectorAll("button, a")].some((element) => element.style.display !== "none");
      toolsCard.style.display = hasVisibleTool ? "" : "none";
    });
    if (![...toolsCard.querySelectorAll("button, a")].some((element) => element.style.display !== "none")) {
      toolsCard.style.display = "none";
    }

    // On wide (desktop/PC) screens, place this as a right-hand sidebar
    // next to the machine grid rather than a full-width bar above it —
    // on narrow screens it still just sits above the (single-column)
    // machine list as before. Either way, the MORE TOOLS card stacks
    // directly under the Activity Overview card, not beside it.
    if (machineGrid && !document.getElementById("belmDashboardLayout")) {
      const layout = document.createElement("div");
      layout.id = "belmDashboardLayout";
      layout.className = "belm-dashboard-layout";
      const overviewStack = document.createElement("div");
      overviewStack.className = "belm-activity-overview-stack";
      overviewCard.appendChild(card);
      overviewCard.appendChild(pettyCashCard);
      overviewStack.appendChild(overviewCard);
      overviewStack.appendChild(toolsCard);
      machineGrid.insertAdjacentElement("beforebegin", layout);
      layout.appendChild(machineGrid);
      layout.appendChild(overviewStack);
      enforceCustomerFeaturePermissions(pettyCashCard);
      enforceCustomerFeaturePermissions(breakdownCard);
    } else {
      overviewCard.appendChild(card);
      overviewCard.appendChild(pettyCashCard);
      rowContainer.insertAdjacentElement("afterend", overviewCard);
      overviewCard.insertAdjacentElement("afterend", toolsCard);
      enforceCustomerFeaturePermissions(pettyCashCard);
      enforceCustomerFeaturePermissions(breakdownCard);
    }

    try {
      const token = localStorage.getItem("belm_customer_token");
      const response = await fetch("/api/customer-portal/analysis", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const grid = document.getElementById("belmActivityOverviewGrid");
      const machines = data.machines || {};
      const actionValues = {
        attention: Number((machines.yellow ?? 0) + (machines.red ?? 0)) || 0,
        service: Number(data.dueForServiceCount ?? 0) || 0,
        requests: Number(data.serviceRequests?.open ?? 0) || 0,
      };
      const items = [
        [belmT("Machine attention"), actionValues.attention, "attention"],
        [belmT("Service due"), actionValues.service, "service"],
        [belmT("Open requests"), actionValues.requests, "requests"],
      ];
      const activeItems = items.filter(([, value]) => Number(value) > 0);
      const activityCard = document.getElementById("belmActivityOverviewCard");
      const activityHead = activityCard?.querySelector(".belm-activity-overview-head");
      const activityIntro = activityCard?.querySelector(".belm-action-center-intro");
      if (activeItems.length === 0) {
        activityCard?.classList.add("is-clear");
        if (activityHead) activityHead.textContent = belmT("STATUS");
        if (activityIntro) activityIntro.textContent = belmT("Only active issues appear here.");
        const hasMachines = Number(machines.total ?? 0) > 0;
        grid.innerHTML = `
          <div class="belm-action-center-clear belm-action-center-clear-main">
            <b>${hasMachines ? belmT("ALL MACHINES UNDER CONTROL") : belmT("NO ACTIVE MACHINE ACTIONS")}</b>
            <span>${hasMachines ? belmT("No breakdown, service or open request needs action now.") : belmT("No machine action requires attention right now.")}</span>
          </div>`;
      } else {
        activityCard?.classList.remove("is-clear");
        if (activityHead) activityHead.textContent = belmT("ACTION REQUIRED");
        if (activityIntro) activityIntro.textContent = belmT("Only items that need attention are shown.");
        grid.innerHTML = activeItems.map(([label, value, key]) => `
          <button type="button" class="belm-activity-overview-item belm-action-item-${key}" data-belm-action-center-target="${key}">
            <span>${label}</span><strong>${value}</strong><small>${belmT("Open")}</small>
          </button>`).join("");
      }
      const pettyAccount = data.pettyCashAccount || {};
      const pettyBalance = Number(pettyAccount.balance || 0);
      const pettyBalanceEl = document.getElementById("belmPettyCashBalance");
      if (pettyBalanceEl) {
        pettyBalanceEl.textContent = `TZS ${Math.abs(pettyBalance).toLocaleString("en-TZ", { maximumFractionDigits: 2 })}`;
        pettyBalanceEl.classList.toggle("is-debt", pettyBalance < 0);
      }
      const pettyUsedEl = document.getElementById("belmPettyCashUsed");
      const pettyTopupEl = document.getElementById("belmPettyCashTopup");
      if (pettyUsedEl) pettyUsedEl.textContent = `TZS ${Number(pettyAccount.totalUsed || 0).toLocaleString("en-TZ", { maximumFractionDigits: 2 })}`;
      if (pettyTopupEl) pettyTopupEl.textContent = `TZS ${Number(pettyAccount.totalToppedUp || 0).toLocaleString("en-TZ", { maximumFractionDigits: 2 })}`;
      enforceCustomerFeaturePermissions(pettyCashCard);

      const snapshot = document.getElementById("belmActionCenterSnapshotGrid");
      if (snapshot) {
        const snapshotItems = [
          [belmT("Machines"), machines.total ?? "—"],
          [belmT("Procurement"), data.machineExpensesTotal != null ? `TZS ${Number(data.machineExpensesTotal).toLocaleString("en-TZ")}` : "—"],
          [belmT("Fuel top-up"), data.fuelCostTotal != null ? `TZS ${Number(data.fuelCostTotal).toLocaleString("en-TZ")}` : "—"],
          [belmT("Containers handled"), data.totalContainersHandled ?? "—"],
        ];
        snapshot.innerHTML = snapshotItems.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join("");
      }

      // Fill in the MORE TOOLS card's Management Email with a real
      // account-wide summary now that the aggregate data has loaded,
      // instead of the generic placeholder it was created with.
      const toolsEmailButton = document.querySelector("#belmAccountToolsCard [data-email-report]");
      if (toolsEmailButton) {
        const needingAttention = (machines.yellow ?? 0) + (machines.red ?? 0);
        toolsEmailButton.dataset.reportMessage =
          `BELM Portal account report: ${machines.total ?? "—"} machine(s), ${needingAttention} needing attention. ` +
          `Open service requests: ${data.serviceRequests?.open ?? "—"}. Checklist reports: ${data.checklistReportsCount ?? "—"}. ` +
          `Procurement total: ${data.machineExpensesTotal != null ? `TZS ${Number(data.machineExpensesTotal).toLocaleString("en-TZ")}` : "—"}. ` +
          `Fuel top-up total: ${data.fuelCostTotal != null ? `TZS ${Number(data.fuelCostTotal).toLocaleString("en-TZ")}` : "—"}. ` +
          `Running hrs due for service: ${data.dueForServiceCount ?? "—"}.`;
      }

      const machinesBox = document.getElementById("belmActivityOverviewMachines");
      const perMachine = data.perMachine || [];
      if (machinesBox) {
        const actionable = perMachine.filter((m) =>
          ["RED", "YELLOW"].includes(String(m.status || "").toUpperCase()) ||
          ["RED", "YELLOW"].includes(String(m.serviceLevel || "").toUpperCase()) ||
          Number(m.openServiceRequests || 0) > 0
        );
        machinesBox.innerHTML = actionable.length ? `
          <div class="belm-activity-overview-submhead">${belmT("MACHINES NEEDING ACTION")}</div>
          ${actionable.slice(0, 6).map((m) => {
            const rank = { RED: 2, YELLOW: 1, GREEN: 0 };
            const statusUp = String(m.status || "GREEN").toUpperCase();
            const levelUp = String(m.serviceLevel || "GREEN").toUpperCase();
            const effectiveLevel = (rank[levelUp] ?? 0) > (rank[statusUp] ?? 0) ? levelUp : statusUp;
            const statusKey = effectiveLevel.toLowerCase();
            const serviceNote = m.serviceLevel === "RED" ? belmT("Service overdue")
              : m.serviceLevel === "YELLOW" ? belmT("Service due soon") : belmT("Service on schedule");
            return `
              <button type="button" class="belm-activity-overview-machine ${effectiveLevel === "RED" ? "belm-machine-urgent-blink" : ""}" data-belm-machine-focus="${escapeHtml(String(m.id || ""))}">
                <div class="belm-activity-overview-machine-head">
                  <b>${escapeHtml(m.name)}</b>
                  <span class="belm-activity-overview-machine-status status-${statusKey}">${escapeHtml(effectiveLevel.replace("_", " "))}</span>
                </div>
                <div class="belm-activity-overview-machine-stats">
                  ${Number(m.openServiceRequests || 0) ? `<span>${m.openServiceRequests} ${belmT("open request(s)")}</span>` : ""}
                  <span>${escapeHtml(serviceNote)}</span>
                </div>
              </button>`;
          }).join("")}` : '';
      }

      card.addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-belm-action-center-target]");
        if (actionButton) {
          const target = actionButton.dataset.belmActionCenterTarget;
          if (target === "requests") {
            const requestsHeading = Array.from(document.querySelectorAll("h1,h2,h3"))
              .find((el) => /service requests/i.test(el.textContent || ""));
            requestsHeading?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }
          const machineGrid = document.querySelector(".belm-customer-machine-grid");
          machineGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        const machineButton = event.target.closest("[data-belm-machine-focus]");
        if (machineButton) {
          const targetCard = document.querySelector(`.belm-customer-machine-card[data-belm-machine-id="${CSS.escape(machineButton.dataset.belmMachineFocus || "")}"]`);
          if (targetCard) {
            targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
            targetCard.classList.add("belm-machine-focus-pulse");
            setTimeout(() => targetCard.classList.remove("belm-machine-focus-pulse"), 1800);
          }
        }
      });
    } catch (_) {
      const grid = document.getElementById("belmActivityOverviewGrid");
      if (grid) grid.innerHTML = '<p class="belm-activity-overview-loading">Could not load activity overview.</p>';
    }
  }

  async function enhanceServiceRequestHistory() {
    if (isCustomerOperatorRole()) return;
    if (window.location.pathname !== "/portal/dashboard") return;
    const heading = Array.from(document.querySelectorAll("h2"))
      .find((h) => (h.textContent || "").trim() === "Your service requests");
    if (!heading) return;
    const table = heading.parentElement?.querySelector("table");
    if (!table || table.dataset.belmHandledBy === "1") return;

    const token = localStorage.getItem("belm_customer_token");
    let requests;
    try {
      const response = await fetch("/api/customer-portal/service-requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      requests = await response.json();
    } catch (_) {
      return;
    }

    const headRow = table.querySelector("thead tr");
    const bodyRows = table.querySelectorAll("tbody tr");
    if (!headRow || bodyRows.length === 0 || bodyRows.length !== requests.length) return;

    table.dataset.belmHandledBy = "1";
    const th = document.createElement("th");
    th.className = "text-left px-5 py-3";
    th.textContent = "Handled by";
    headRow.insertBefore(th, headRow.lastElementChild);
    const hideTh = document.createElement("th");
    hideTh.className = "text-left px-5 py-3";
    headRow.appendChild(hideTh);

    bodyRows.forEach((row, index) => {
      const request = requests[index];
      let text = "—";
      if (request.status === "COMPLETED" && request.completedBy) {
        text = `Completed by ${request.completedBy.name}`;
      } else if (request.status === "CANCELLED" && request.cancelledBy) {
        text = `Cancelled by ${request.cancelledBy.name}`;
      } else if (request.assignedTo) {
        text = `Assigned to ${request.assignedTo.name}`;
      }
      const td = document.createElement("td");
      td.className = "px-5 py-3 text-slate-500";
      td.textContent = text;
      row.insertBefore(td, row.lastElementChild);

      const hideTd = document.createElement("td");
      hideTd.className = "px-5 py-3";
      if (["COMPLETED", "CANCELLED"].includes(request.status)) {
        const hideButton = document.createElement("button");
        hideButton.type = "button";
        hideButton.textContent = "Hide";
        hideButton.className = "belm-hide-request-button";
        hideButton.addEventListener("click", async () => {
          hideButton.disabled = true;
          hideButton.textContent = "Hiding…";
          try {
            const response = await fetch(`/api/customer-portal/service-requests/${encodeURIComponent(request.id)}/hide`, {
              method: "PUT",
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error();
            row.remove();
          } catch (_) {
            hideButton.disabled = false;
            hideButton.textContent = "Hide";
          }
        });
        hideTd.appendChild(hideButton);
      }
      row.appendChild(hideTd);
    });

    // A small link above the table to view/restore anything hidden —
    // matches the same "still there, just tidied away" behaviour Admin
    // already has for their own Service Request Manager.
    if (!document.getElementById("belmShowHiddenRequestsLink")) {
      const link = document.createElement("button");
      link.id = "belmShowHiddenRequestsLink";
      link.type = "button";
      link.textContent = "View hidden requests";
      link.className = "belm-show-hidden-requests-link";
      link.addEventListener("click", () => openHiddenRequestsDialog(token));
      heading.insertAdjacentElement("afterend", link);
    }
  }

  async function openHiddenRequestsDialog(token) {
    let dialog = document.getElementById("belmHiddenRequestsDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "belmHiddenRequestsDialog";
      dialog.className = "belm-analysis-dialog";
      dialog.innerHTML = `
        <div class="belm-analysis-dialog-card">
          <div class="belm-analysis-head">
            <span>HIDDEN SERVICE REQUESTS</span>
            <button type="button" class="belm-analysis-close" aria-label="Close">×</button>
          </div>
          <div id="belmHiddenRequestsBody" class="belm-operator-reports-body"></div>
        </div>`;
      document.body.appendChild(dialog);
      dialog.querySelector(".belm-analysis-close").addEventListener("click", () => dialog.close());
    }
    const body = document.getElementById("belmHiddenRequestsBody");
    body.innerHTML = '<p class="muted">Loading…</p>';
    dialog.showModal();
    try {
      const response = await fetch("/api/customer-portal/service-requests?hidden=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const hidden = response.ok ? await response.json() : [];
      body.innerHTML = hidden.length
        ? hidden.map((request) => `
            <div class="belm-operator-report-row">
              <div class="belm-operator-report-head">
                <b>${escapeHtml(request.description || request.serviceType || "Service request")}</b>
                <span class="belm-operator-report-status status-resolved">${escapeHtml(request.status)}</span>
              </div>
              <small>${formatTanzaniaDateTime(request.createdAt)}</small>
              <button type="button" class="belm-hide-request-button" data-unhide="${escapeHtml(request.id)}" style="margin-top:8px">Restore to list</button>
            </div>`).join("")
        : '<p class="muted">Nothing hidden right now.</p>';
      body.querySelectorAll("[data-unhide]").forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await fetch(`/api/customer-portal/service-requests/${encodeURIComponent(button.dataset.unhide)}/unhide`, {
              method: "PUT",
              headers: { Authorization: `Bearer ${token}` },
            });
            button.closest(".belm-operator-report-row").remove();
          } catch (_) {
            button.disabled = false;
          }
        });
      });
    } catch (_) {
      body.innerHTML = '<p class="belm-analysis-error">Could not load hidden requests.</p>';
    }
  }

  function enforceCustomerFeaturePermissions(scope) {
    const payload = tokenPayload("belm_customer_token");
    const permissions = customerCurrentPermissions !== undefined ? customerCurrentPermissions : payload?.permissions;
    scope.querySelectorAll("[data-belm-feature]").forEach((element) => {
      element.style.removeProperty("display");
    });
    if (Array.isArray(permissions)) {
      scope.querySelectorAll("[data-belm-feature]").forEach((element) => {
        if (!permissions.includes(element.dataset.belmFeature)) {
          element.style.display = "none";
        }
      });
    }
    const role = payload?.customerRole;
    const hasAssignUsersPermission = Array.isArray(permissions) && permissions.includes("assign-users");
    scope.querySelectorAll("[data-belm-owner-admin-only]").forEach((element) => {
      if (role !== "owner" && role !== "admin" && !hasAssignUsersPermission) element.style.display = "none";
    });
  }

  function dismissedAnnouncementIds() {
    try {
      const stored = JSON.parse(localStorage.getItem("belm_dismissed_announcements") || "[]");
      return Array.isArray(stored) ? stored.map((id) => String(id)) : [];
    } catch (_) {
      return [];
    }
  }

  function dismissAnnouncement(id) {
    const normalizedId = String(id);
    const dismissed = dismissedAnnouncementIds();
    if (!dismissed.includes(normalizedId)) dismissed.push(normalizedId);
    localStorage.setItem("belm_dismissed_announcements", JSON.stringify(dismissed));
  }

  async function enhanceCustomerDirectMessagesPanel() {
    if (isCustomerOperatorRole()) return;
    if (window.location.pathname !== "/portal/dashboard") return;
    if (document.getElementById("belmCustomerDirectMessagesPanel")) return;
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return;
    try {
      const response = await fetch("/api/customer-portal/communications", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const allItems = await response.json();
      if (!Array.isArray(allItems) || !allItems.length) return;
      const dismissedKey = "belm_dismissed_messages";
      const dismissed = new Set(JSON.parse(localStorage.getItem(dismissedKey) || "[]"));
      const items = allItems.filter((item) => !dismissed.has(String(item.id)));
      if (!items.length) return;
      const heading = Array.from(document.querySelectorAll("h1, h2")).find((el) => (el.textContent || "").trim() === "Your machines");
      const anchor = heading?.closest("section") || heading?.parentElement;
      if (!anchor) return;
      const panel = document.createElement("section");
      panel.id = "belmCustomerDirectMessagesPanel";
      panel.className = "belm-customer-messages-panel";
      panel.innerHTML = `
        <div class="belm-customer-messages-head"><span>MESSAGES FROM BELM</span><small>Saved communication history</small></div>
        <div class="belm-customer-messages-list">${items.slice(0, 8).map((item) => `
          <article class="belm-customer-message-row" data-belm-message-id="${escapeHtml(String(item.id))}">
            <div class="belm-customer-message-title"><strong>${escapeHtml(item.subject || "Message from BELM")}</strong><span>${escapeHtml(formatTanzaniaDateTime(item.createdAt))}</span></div>
            <p>${escapeHtml(item.message || "")}</p>
            <small>${item.machineLabel ? `Machine: ${escapeHtml(item.machineLabel)} · ` : ""}From: ${escapeHtml(item.createdByName || "BELM")}${item.status === "PORTAL_ONLY" ? " · Portal delivery only" : ""}</small>
            <div class="belm-customer-message-actions"><button type="button" class="belm-customer-message-ok" data-belm-dismiss-message>HIDE</button></div>
          </article>`).join("")}</div>`;
      anchor.before(panel);
      panel.querySelectorAll("[data-belm-dismiss-message]").forEach((button) => {
        button.addEventListener("click", () => {
          const row = button.closest("[data-belm-message-id]");
          const id = row?.dataset.belmMessageId;
          if (id) {
            const current = new Set(JSON.parse(localStorage.getItem(dismissedKey) || "[]"));
            current.add(id);
            localStorage.setItem(dismissedKey, JSON.stringify([...current]));
          }
          row?.remove();
          if (!panel.querySelector("[data-belm-message-id]")) panel.remove();
        });
      });
    } catch (_) {}
  }

  async function enhanceCustomerProformasPanel() {
    if (isCustomerOperatorRole()) return;
    if (window.location.pathname !== "/portal/dashboard") return;
    if (document.getElementById("belmCustomerProformasPanel")) return;
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return;
    try {
      const response = await fetch("/api/customer-portal/proformas", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const items = await response.json();
      if (!Array.isArray(items) || !items.length) return;
      const heading = Array.from(document.querySelectorAll("h1, h2")).find((el) => (el.textContent || "").trim() === "Your machines");
      const anchor = heading?.closest("section") || heading?.parentElement;
      if (!anchor) return;
      const panel = document.createElement("section");
      panel.id = "belmCustomerProformasPanel";
      panel.className = "belm-customer-proformas-panel";
      panel.innerHTML = `<div class="belm-customer-proformas-head"><span>PROFORMAS FROM BELM</span><small>Official portal copies</small></div>` + items.map((item) => `
        <article class="belm-customer-proforma-row" data-proforma-id="${escapeHtml(item.id)}">
          <div><strong>${escapeHtml(item.invoiceNo)}</strong> · TZS ${Number(item.totals?.grandTotal || 0).toLocaleString("en-TZ")}</div>
          <div class="belm-customer-proforma-meta"><span>Sent: ${escapeHtml(formatTanzaniaDateTime(item.sentAt || item.createdAt))}</span><span>Status: ${escapeHtml(item.customerResponse || item.deliveryStatus)}</span></div>
          ${item.customerResponseMessage ? `<small>${escapeHtml(item.customerResponseMessage)}</small>` : ""}
          <div class="belm-customer-proforma-actions">
            <button type="button" data-proforma-pdf="view">View PDF</button>
            <button type="button" data-proforma-pdf="download">Download</button>
            <button type="button" data-proforma-pdf="print">Print</button>
            ${!item.customerResponse ? `<button type="button" class="primary" data-proforma-response="ACCEPTED">Accept</button><button type="button" data-proforma-response="CHANGE_REQUESTED">Request Change</button>` : ""}
          </div>
        </article>`).join("");
      anchor.before(panel);
      panel.querySelectorAll("[data-proforma-pdf]").forEach((button) => button.addEventListener("click", () => {
        const row = button.closest("[data-proforma-id]");
        customerPdfAction(`/api/customer-portal/proformas/${encodeURIComponent(row.dataset.proformaId)}/download`, button.dataset.proformaPdf, "BELM-Proforma.pdf").catch((error) => alert(error.message));
      }));
      panel.querySelectorAll("[data-proforma-response]").forEach((button) => button.addEventListener("click", async () => {
        const row = button.closest("[data-proforma-id]");
        const responseValue = button.dataset.proformaResponse;
        let message = "";
        if (responseValue === "CHANGE_REQUESTED") {
          message = prompt("What should BELM change on this Proforma?") || "";
          if (!message.trim()) return;
        } else if (!confirm("Accept this Proforma and notify BELM Accounts?")) return;
        button.disabled = true;
        try {
          const response = await fetch(`/api/customer-portal/proformas/${encodeURIComponent(row.dataset.proformaId)}/respond`, {
            method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ response: responseValue, message }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || "Could not send your response.");
          panel.remove();
          await enhanceCustomerProformasPanel();
          alert(responseValue === "ACCEPTED" ? "BELM Accounts has been notified that you accepted the Proforma." : "Your requested change has been sent to BELM Accounts.");
        } catch (error) { alert(error.message); button.disabled = false; }
      }));
    } catch (_) {}
  }

  async function enhanceCustomerAnnouncementsPanel() {
    if (isCustomerOperatorRole()) return;
    if (window.location.pathname !== "/portal/dashboard") return;
    if (document.getElementById("belmAnnouncementsPanel")) return;
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return;
    try {
      const response = await fetch("/api/announcements", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const data = await response.json();
      const dismissed = dismissedAnnouncementIds();
      const messages = (Array.isArray(data.messages) ? data.messages : [])
        .filter(item => !dismissed.includes(String(item.id)));
      if (!messages.length) return;

      const heading = Array.from(document.querySelectorAll("h1, h2"))
        .find(element => (element.textContent || "").trim() === "Your machines");
      const anchor = heading?.closest("section") || heading?.parentElement;
      if (!anchor) return;

      const panel = document.createElement("section");
      panel.id = "belmAnnouncementsPanel";
      panel.className = "belm-announcements-panel";
      panel.innerHTML = `
        <div class="belm-announcements-head"><span>MESSAGES FROM BELM ADMIN</span></div>
        <div class="belm-announcements-list">${messages.map(item => `
          <article class="belm-announcement-item" data-announcement-id="${escapeHtml(item.id)}">
            <p>${escapeHtml(item.message)}</p>
            <div class="belm-announcement-footer">
              <small>${new Date(item.created_at).toLocaleDateString()}</small>
              <div class="belm-announcement-actions">
                <a target="_blank" rel="noopener" href="${whatsappShareUrl(`BELM Portal message: ${item.message}`)}">Send via WhatsApp</a>
                <button type="button" class="belm-announcement-ok" data-dismiss-announcement="${escapeHtml(item.id)}">HIDE</button>
              </div>
            </div>
          </article>`).join("")}</div>`;
      anchor.before(panel);

      panel.querySelectorAll("[data-dismiss-announcement]").forEach(button => {
        button.addEventListener("click", () => {
          const id = button.dataset.dismissAnnouncement;
          dismissAnnouncement(id);
          const item = panel.querySelector(`[data-announcement-id="${id}"]`);
          if (item) item.remove();
          if (!panel.querySelector(".belm-announcement-item")) panel.remove();
        });
      });
    } catch (_) {}
  }

  let belmSavedEmailsCache = null;

  function ensureEmailReportDialog() {
    let dialog = document.getElementById("belmEmailReportDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "belmEmailReportDialog";
    dialog.className = "belm-analysis-dialog belm-email-dialog";
    dialog.innerHTML = `
      <form class="belm-analysis-dialog-card belm-email-form">
        <div class="belm-analysis-head">
          <span>MANAGEMENT EMAIL</span>
          <button type="button" class="belm-analysis-close" aria-label="Close">×</button>
        </div>
        <div class="belm-email-body">
          <p class="belm-email-intro">Share this with your Administration or management team — customer account emails and active portal users sync here automatically.</p>
          <div id="belmEmailError" class="belm-email-error" hidden></div>

          <label>Send to <small>(select one or more)</small></label>
          <div id="belmEmailRecipients" class="belm-email-recipients">
            <p class="belm-email-empty-list">No saved emails yet — add one below.</p>
          </div>

          <div class="belm-email-add-row">
            <input type="text" id="belmEmailNewLabel" maxlength="100" placeholder="Label, e.g. Administration">
            <input type="email" id="belmEmailNewAddress" placeholder="email@company.com">
            <button type="button" id="belmEmailAddButton">+ Add</button>
          </div>

          <label>CC <small>(optional — other people to copy in, comma-separated)</small>
            <input type="text" id="belmEmailCc" placeholder="accountant@company.com, office@company.com">
          </label>

          <label>Message
            <textarea id="belmEmailMessage" rows="5"></textarea>
          </label>

          <label>Attachments <small>(photo, PDF, Excel, Word — up to 5 files, 15 MB total)</small></label>
          <div class="belm-email-attach-row">
            <input type="file" id="belmEmailAttachInput" multiple accept="image/*,.pdf,.xlsx,.xls,.doc,.docx,application/pdf">
          </div>
          <ul id="belmEmailAttachList" class="belm-email-attach-list"></ul>

          <button type="submit" class="belm-email-send" id="belmEmailSendButton">Send email</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    dialog.querySelector(".belm-analysis-close").addEventListener("click", () => dialog.close());

    const attachState = [];
    dialog._attachState = attachState;
    const MAX_ATTACH_TOTAL_BYTES = 15 * 1024 * 1024;

    function renderAttachList() {
      const list = document.getElementById("belmEmailAttachList");
      list.innerHTML = attachState.map((item, index) => `
        <li>
          <span>${item.name} <small>(${(item.size / 1024).toFixed(0)} KB)</small></span>
          <button type="button" data-remove-attach="${index}" aria-label="Remove">×</button>
        </li>`).join("");
      list.querySelectorAll("[data-remove-attach]").forEach((button) => {
        button.addEventListener("click", () => {
          attachState.splice(Number(button.dataset.removeAttach), 1);
          renderAttachList();
        });
      });
    }
    dialog._renderAttachList = renderAttachList;

    dialog.querySelector("#belmEmailAttachInput").addEventListener("change", async (event) => {
      const errorBox = document.getElementById("belmEmailError");
      errorBox.hidden = true;
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (attachState.length + files.length > 5) {
        errorBox.textContent = "Attach at most 5 files per email.";
        errorBox.hidden = false;
        return;
      }
      for (const file of files) {
        const currentTotal = attachState.reduce((sum, item) => sum + item.size, 0);
        if (currentTotal + file.size > MAX_ATTACH_TOTAL_BYTES) {
          errorBox.textContent = "Attachments are too large — keep the total under 15 MB.";
          errorBox.hidden = false;
          break;
        }
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Could not read this file."));
          reader.readAsDataURL(file);
        }).catch(() => null);
        if (!dataUrl) continue;
        attachState.push({ name: file.name, size: file.size, dataUrl });
      }
      renderAttachList();
    });

    dialog.querySelector("#belmEmailAddButton").addEventListener("click", async () => {
      const errorBox = document.getElementById("belmEmailError");
      const label = document.getElementById("belmEmailNewLabel").value.trim();
      const email = document.getElementById("belmEmailNewAddress").value.trim();
      errorBox.hidden = true;
      if (!label || !email) {
        errorBox.textContent = "Enter both a label and an email address to add it.";
        errorBox.hidden = false;
        return;
      }
      const token = localStorage.getItem("belm_customer_token");
      try {
        const response = await fetch("/api/customer-portal/saved-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ label, email }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not add this email.");
        document.getElementById("belmEmailNewLabel").value = "";
        document.getElementById("belmEmailNewAddress").value = "";
        belmSavedEmailsCache = null;
        await renderEmailRecipients();
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.hidden = false;
      }
    });

    dialog.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById("belmEmailError");
      const button = document.getElementById("belmEmailSendButton");
      const token = localStorage.getItem("belm_customer_token");
      const recipients = [...dialog.querySelectorAll("[data-recipient-checkbox]:checked")].map((box) => box.value);
      errorBox.hidden = true;
      if (recipients.length === 0) {
        errorBox.textContent = "Select at least one saved email to send to.";
        errorBox.hidden = false;
        return;
      }
      button.disabled = true;
      button.textContent = "Sending…";
      const message = document.getElementById("belmEmailMessage").value;
      const subject = dialog.dataset.subject || "BELM Portal report";
      const ccList = document.getElementById("belmEmailCc").value
        .split(",")
        .map((email) => email.trim())
        .filter((email) => email !== "");
      const invalidCc = ccList.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
      if (invalidCc) {
        errorBox.textContent = `"${invalidCc}" is not a valid CC email address.`;
        errorBox.hidden = false;
        button.disabled = false;
        button.textContent = "Send email";
        return;
      }
      const attachmentsPayload = attachState.map((item) => ({ filename: item.name, data: item.dataUrl }));
      let failures = 0;
      for (const to of recipients) {
        try {
          const response = await fetch("/api/customer-portal/email-report", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ to, cc: ccList, subject, message, attachments: attachmentsPayload }),
          });
          if (!response.ok) failures += 1;
        } catch (_) {
          failures += 1;
        }
      }
      button.disabled = false;
      button.textContent = "Send email";
      if (failures === 0) {
        dialog.close();
        attachState.length = 0;
        renderAttachList();
        alert(`Email sent successfully to ${recipients.length} recipient(s).`);
      } else {
        errorBox.textContent = `${recipients.length - failures} of ${recipients.length} email(s) sent. ${failures} failed — please try again.`;
        errorBox.hidden = false;
      }
    });
    return dialog;
  }

  async function renderEmailRecipients() {
    const container = document.getElementById("belmEmailRecipients");
    const saved = await loadSavedEmails();
    container.innerHTML = saved.length
      ? saved.map((entry) => `
          <div class="belm-email-recipient-row" data-recipient-row="${escapeHtml(entry.id)}">
            <label>
              <input type="checkbox" data-recipient-checkbox value="${escapeHtml(entry.email)}">
              <span>${escapeHtml(entry.label)} <small>(${escapeHtml(entry.email)})${entry.synced ? " · synced" : ""}</small></span>
            </label>
            ${entry.editable === false ? "" : `<button type="button" class="belm-email-edit-btn" data-edit-recipient="${escapeHtml(entry.id)}" aria-label="Edit">✎</button>`}
          </div>`).join("")
      : '<p class="belm-email-empty-list">No management contacts yet — add one below.</p>';

    container.querySelectorAll("[data-edit-recipient]").forEach((button) => {
      button.addEventListener("click", () => {
        const entryId = button.dataset.editRecipient;
        const entry = saved.find((item) => item.id === entryId);
        if (!entry) return;
        const row = container.querySelector(`[data-recipient-row="${entryId}"]`);
        row.innerHTML = `
          <input type="text" class="belm-email-edit-label" value="${escapeHtml(entry.label)}" maxlength="100">
          <input type="email" class="belm-email-edit-address" value="${escapeHtml(entry.email)}">
          <button type="button" class="belm-email-edit-save" data-save-recipient="${escapeHtml(entryId)}">Save</button>
          <button type="button" class="belm-email-edit-cancel" data-cancel-recipient="${escapeHtml(entryId)}">Cancel</button>
          <button type="button" class="belm-email-edit-delete" data-delete-recipient="${escapeHtml(entryId)}">Delete</button>`;

        row.querySelector("[data-cancel-recipient]").addEventListener("click", renderEmailRecipients);

        row.querySelector("[data-delete-recipient]").addEventListener("click", async () => {
          if (!confirm(`Remove "${entry.label}" (${entry.email}) from your saved emails?`)) return;
          try {
            const token = localStorage.getItem("belm_customer_token");
            await fetch(`/api/customer-portal/saved-emails/${entryId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            belmSavedEmailsCache = null;
            renderEmailRecipients();
          } catch (_) {
            alert("Could not remove that saved email. Try again.");
          }
        });

        row.querySelector("[data-save-recipient]").addEventListener("click", async () => {
          const label = row.querySelector(".belm-email-edit-label").value.trim();
          const email = row.querySelector(".belm-email-edit-address").value.trim();
          if (!label || !email) {
            alert("Enter both a label and an email address.");
            return;
          }
          try {
            const token = localStorage.getItem("belm_customer_token");
            const response = await fetch(`/api/customer-portal/saved-emails/${entryId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ label, email }),
            });
            if (!response.ok) {
              const error = await response.json().catch(() => ({}));
              throw new Error(error.error || "Could not save changes.");
            }
            belmSavedEmailsCache = null;
            renderEmailRecipients();
          } catch (error) {
            alert(error.message || "Could not save changes.");
          }
        });
      });
    });
  }

  async function loadSavedEmails() {
    if (belmSavedEmailsCache) return belmSavedEmailsCache;
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return [];
    try {
      const response = await fetch("/api/customer-portal/saved-emails", { headers: { Authorization: `Bearer ${token}` } });
      belmSavedEmailsCache = response.ok ? await response.json() : [];
    } catch (_) {
      belmSavedEmailsCache = [];
    }
    return belmSavedEmailsCache;
  }

  async function openEmailReportDialog(subject, message) {
    const dialog = ensureEmailReportDialog();
    dialog.dataset.subject = subject;
    document.getElementById("belmEmailMessage").value = message;
    document.getElementById("belmEmailCc").value = "";
    document.getElementById("belmEmailError").hidden = true;
    if (dialog._attachState) dialog._attachState.length = 0;
    dialog._renderAttachList?.();
    await renderEmailRecipients();
    dialog.showModal();
  }

  function wireEmailReportButtons() {
    if (window.location.pathname !== "/portal/dashboard") return;
    document.querySelectorAll("[data-email-report]").forEach((button) => {
      if (button.dataset.belmWired === "1") return;
      button.dataset.belmWired = "1";
      button.addEventListener("click", () => {
        openEmailReportDialog(button.dataset.reportSubject || "BELM Portal report", button.dataset.reportMessage || "");
      });
    });
  }


  function ensureBelmSupportDialog() {
    let dialog = document.getElementById("belmSupportDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "belmSupportDialog";
    dialog.className = "belm-analysis-dialog";
    dialog.innerHTML = `
      <form class="belm-analysis-dialog-card belm-email-form">
        <div class="belm-analysis-head">
          <span>CONTACT BELM SUPPORT</span>
          <button type="button" class="belm-analysis-close" aria-label="Close">×</button>
        </div>
        <div class="belm-email-body">
          <p class="belm-email-intro">This message is saved in your portal history and sent to BELM's official Business Email.</p>
          <div id="belmSupportError" class="belm-email-error" hidden></div>
          <label>Topic
            <select id="belmSupportTopic">
              <option value="TECHNICAL_SUPPORT">Technical support</option>
              <option value="PORTAL_SUPPORT">Portal / system support</option>
              <option value="SERVICE_CONTRACT">Service / contract enquiry</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>Machine <small>(optional)</small>
            <select id="belmSupportMachine"><option value="">— General / account level —</option></select>
          </label>
          <label>Subject
            <input id="belmSupportSubject" type="text" maxlength="160" placeholder="e.g. Need hydraulic diagnostic support" />
          </label>
          <label>Message
            <textarea id="belmSupportMessage" rows="6" maxlength="3000" placeholder="Describe the assistance you need from BELM." required></textarea>
          </label>
          <button type="submit" class="belm-email-send" id="belmSupportSendButton">Send to BELM</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    dialog.querySelector(".belm-analysis-close").addEventListener("click", () => dialog.close());
    dialog.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById("belmSupportError");
      const button = document.getElementById("belmSupportSendButton");
      const token = localStorage.getItem("belm_customer_token");
      const message = document.getElementById("belmSupportMessage").value.trim();
      if (!message) {
        errorBox.textContent = "Write the message you want to send to BELM.";
        errorBox.hidden = false;
        return;
      }
      errorBox.hidden = true;
      button.disabled = true;
      button.textContent = "Sending…";
      try {
        const response = await fetch("/api/customer-portal/belm-support", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            topic: document.getElementById("belmSupportTopic").value,
            machineId: document.getElementById("belmSupportMachine").value,
            subject: document.getElementById("belmSupportSubject").value.trim(),
            message,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not send your message to BELM.");
        dialog.close();
        alert(result.message || "Message sent to BELM.");
        document.getElementById("belmSupportSubject").value = "";
        document.getElementById("belmSupportMessage").value = "";
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.hidden = false;
      } finally {
        button.disabled = false;
        button.textContent = "Send to BELM";
      }
    });
    return dialog;
  }

  async function openBelmSupportDialog(machineId = "") {
    const dialog = ensureBelmSupportDialog();
    const select = document.getElementById("belmSupportMachine");
    const machines = await loadCustomerExpenseMachines();
    select.innerHTML = '<option value="">— General / account level —</option>'
      + machines.map((machine) => {
        const label = [machine.brand, machine.model, machine.serialNumber || machine.serial_number].filter(Boolean).join(" · ");
        return `<option value="${escapeHtml(machine.id)}">${escapeHtml(label || machine.machineType || "Machine")}</option>`;
      }).join("");
    if (machineId) select.value = machineId;
    document.getElementById("belmSupportError").hidden = true;
    dialog.showModal();
    document.getElementById("belmSupportMessage")?.focus();
  }

  function ensureProblemReportDialog() {
    let dialog = document.getElementById("belmProblemReportDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "belmProblemReportDialog";
    dialog.className = "belm-analysis-dialog";
    dialog.innerHTML = `
      <form class="belm-analysis-dialog-card belm-email-form">
        <div class="belm-analysis-head">
          <span>REPORT A PROBLEM</span>
          <button type="button" class="belm-analysis-close" aria-label="Close">×</button>
        </div>
        <div class="belm-email-body">
          <p class="belm-email-intro" id="belmProblemIntro">Report this problem to your maintenance team.</p>
          <div id="belmProblemError" class="belm-email-error" hidden></div>
          <label>Who is reporting? <small>(optional — pick from your operators)</small>
            <select id="belmProblemOperator"><option value="">— Myself / Not listed —</option></select>
          </label>
          <label>What's the problem?
            <textarea id="belmProblemMessage" rows="5" placeholder="e.g. Hydraulic arm making a grinding noise since this morning" required></textarea>
          </label>
          <label id="belmProblemBelmSupportRow" style="display:flex;gap:10px;align-items:flex-start">
            <input id="belmProblemSendToBelm" type="checkbox" style="width:auto;margin-top:3px" />
            <span><b>Request BELM Technical Support</b><br><small>When selected, BELM receives this report in the portal and by official business email.</small></span>
          </label>
          <button type="submit" class="belm-email-send" id="belmProblemSendButton">Save problem report</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    dialog.querySelector(".belm-analysis-close").addEventListener("click", () => dialog.close());
    document.getElementById("belmProblemSendToBelm")?.addEventListener("change", (event) => {
      const sendButton = document.getElementById("belmProblemSendButton");
      if (!sendButton || event.target.disabled) return;
      sendButton.textContent = event.target.checked
        ? "Send to BELM Technical Support"
        : "Save Internal Report";
    });

    dialog.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById("belmProblemError");
      const button = document.getElementById("belmProblemSendButton");
      const token = localStorage.getItem("belm_customer_token");
      errorBox.hidden = true;
      const message = document.getElementById("belmProblemMessage").value.trim();
      if (!message) {
        errorBox.textContent = "Describe the problem before sending.";
        errorBox.hidden = false;
        return;
      }
      button.disabled = true;
      button.textContent = "Sending…";
      try {
        const response = await fetch(`/api/customer-portal/operator-reports/${encodeURIComponent(dialog.dataset.machineId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            message,
            operatorId: document.getElementById("belmProblemOperator").value,
            sendToBelm: document.getElementById("belmProblemSendToBelm").checked,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not send this report.");
        dialog.close();
        alert(result.message || "Problem reported successfully.");
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.hidden = false;
      } finally {
        button.disabled = false;
        const belmCheckbox = document.getElementById("belmProblemSendToBelm");
        button.textContent = belmCheckbox?.checked
          ? "Send to BELM Technical Support"
          : "Save Internal Report";
      }
    });
    return dialog;
  }

  async function openProblemReportDialog(machineId) {
    const dialog = ensureProblemReportDialog();
    dialog.dataset.machineId = machineId;
    const profile = await loadCustomerPortalProfile();
    const selfServiceMode = Boolean(profile?.isMachineryAdmin);
    const belmCheckbox = document.getElementById("belmProblemSendToBelm");
    const intro = document.getElementById("belmProblemIntro");
    if (selfServiceMode) {
      belmCheckbox.disabled = false;
      belmCheckbox.checked = false;
      intro.textContent = "Self-Service Mode: this report stays with your own maintenance team unless you select BELM Technical Support below.";
      document.getElementById("belmProblemSendButton").textContent = "Save Internal Report";
    } else {
      belmCheckbox.checked = true;
      belmCheckbox.disabled = true;
      intro.textContent = "BELM Service Provider is active: this machine problem will notify BELM automatically. Your other company operations remain under your own portal roles.";
      document.getElementById("belmProblemSendButton").textContent = "Send Report to BELM";
    }
    document.getElementById("belmProblemMessage").value = "";
    document.getElementById("belmProblemError").hidden = true;
    const select = document.getElementById("belmProblemOperator");
    select.innerHTML = '<option value="">— Myself / Not listed —</option>';
    const token = localStorage.getItem("belm_customer_token");
    try {
      const response = await fetch(`/api/customer-portal/machine-operators/${encodeURIComponent(machineId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const operators = await response.json();
        operators.forEach((operator) => {
          const option = document.createElement("option");
          option.value = operator.id;
          option.textContent = `${operator.name} (${operator.contact})`;
          select.appendChild(option);
        });
      }
    } catch (_) {}
    dialog.showModal();
  }

  function wireProblemReportButtons() {
    if (window.location.pathname !== "/portal/dashboard") return;
    document.querySelectorAll("[data-report-problem]").forEach((button) => {
      if (button.dataset.belmWired === "1") return;
      button.dataset.belmWired = "1";
      button.addEventListener("click", () => openProblemReportDialog(button.dataset.reportProblem));
    });
  }

  function ensureOperatorReportsDialog() {
    let dialog = document.getElementById("belmOperatorReportsDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "belmOperatorReportsDialog";
    dialog.className = "belm-analysis-dialog belm-operator-reports-dialog";
    dialog.innerHTML = `
      <div class="belm-analysis-dialog-card">
        <div class="belm-analysis-head">
          <span>OPERATOR REPORTS</span>
          <button type="button" class="belm-analysis-close" aria-label="Close">×</button>
        </div>
        <div id="belmOperatorReportsBody" class="belm-operator-reports-body"></div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector(".belm-analysis-close").addEventListener("click", () => dialog.close());
    return dialog;
  }

  async function openOperatorReportsDialog(machineId, isTechnician) {
    const dialog = ensureOperatorReportsDialog();
    const body = document.getElementById("belmOperatorReportsBody");
    body.innerHTML = '<p class="muted">Loading…</p>';
    dialog.showModal();
    try {
      let reports;
      if (isTechnician) {
        const token = localStorage.getItem("belm_tech_token");
        const response = await fetch(`/api/checklist-reports?action=operator-reports&machineId=${encodeURIComponent(machineId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Could not load operator reports.");
        reports = await response.json();
      } else {
        const token = localStorage.getItem("belm_customer_token");
        const response = await fetch(`/api/customer-portal/operator-reports/${encodeURIComponent(machineId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Could not load operator reports.");
        reports = await response.json();
      }
      body.innerHTML = (reports || []).length
        ? reports.map((report) => `
            <div class="belm-operator-report-row">
              <div class="belm-operator-report-head">
                <b>${escapeHtml(report.operator_name || report.operatorName || "Operator")}</b>
                <span class="belm-operator-report-status status-${escapeHtml((report.status || "OPEN").toLowerCase())}">${escapeHtml(report.status || "OPEN")}</span>
              </div>
              <p>${escapeHtml(report.message)}</p>
              <small>${formatTanzaniaDateTime(report.created_at || report.createdAt)}${report.resolved_at || report.resolvedAt ? ` · Resolved ${formatTanzaniaDateTime(report.resolved_at || report.resolvedAt)}` : ""}</small>
              ${isTechnician && String(report.status || "OPEN").toUpperCase() === "OPEN"
                ? `<button type="button" class="belm-hide-request-button" data-tech-resolve-operator-report="${escapeHtml(report.id)}" style="margin-top:8px">Mark Resolved</button>`
                : ""}
            </div>`).join("")
        : '<p class="muted">No operator reports for this machine yet.</p>';
      if (isTechnician) {
        body.querySelectorAll("[data-tech-resolve-operator-report]").forEach((button) => {
          button.addEventListener("click", async () => {
            const token = localStorage.getItem("belm_tech_token");
            button.disabled = true;
            button.textContent = "Resolving…";
            try {
              const response = await fetch(`/api/checklist-reports?action=resolve-operator-report&machineId=${encodeURIComponent(machineId)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ reportId: button.dataset.techResolveOperatorReport }),
              });
              const result = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(result.error || "Could not resolve this report.");
              await openOperatorReportsDialog(machineId, true);
            } catch (error) {
              alert(error.message || "Could not resolve this report.");
              button.disabled = false;
              button.textContent = "Mark Resolved";
            }
          });
        });
      }
    } catch (error) {
      body.innerHTML = `<p class="belm-analysis-error">${escapeHtml(error.message)}</p>`;
    }
  }

  function wireOperatorReportsButtons() {
    document.querySelectorAll("[data-view-operator-reports]").forEach((button) => {
      if (button.dataset.belmWired === "1") return;
      button.dataset.belmWired = "1";
      button.addEventListener("click", () =>
        openOperatorReportsDialog(button.dataset.viewOperatorReports, button.dataset.technicianContext === "1"));
    });
  }

  async function loadCustomerSpareRecommendations() {
    if (customerSpareRecommendationsCache) return customerSpareRecommendationsCache;
    if (customerSpareRecommendationsPromise) return customerSpareRecommendationsPromise;
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return [];
    customerSpareRecommendationsPromise = fetch("/api/spare-recommendations", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load recommendations.");
        customerSpareRecommendationsCache = await response.json();
        return customerSpareRecommendationsCache;
      })
      .catch(() => {
        customerSpareRecommendationsPromise = null;
        return [];
      });
    return customerSpareRecommendationsPromise;
  }

  async function confirmSpareRecommendation(id, button) {
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const response = await fetch(`/api/spare-recommendations/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not send this service requirement.");
      const item = button.closest(".belm-spare-recommendation-item");
      if (item) {
        item.innerHTML = `<span>Sent to BELM for action.</span>`;
      }
      customerSpareRecommendationsCache = null;
    } catch (error) {
      alert(error.message || "Could not send this service requirement.");
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async function customerSpareRecommendationsPanel(card, machine) {
    if (card.dataset.belmSpareRecommendReady === "1") return;
    const all = await loadCustomerSpareRecommendations();
    const items = Array.isArray(all) ? all.filter(item => String(item.machine_id) === String(machine.id)) : [];
    if (!items.length) return;
    card.dataset.belmSpareRecommendReady = "1";

    const panel = document.createElement("div");
    panel.className = "belm-spare-recommendation-panel";
    panel.innerHTML = `<div class="belm-spare-recommendation-head">SPARE RECOMMENDED BY TECHNICIAN</div>
      ${items.map(item => `
        <div class="belm-spare-recommendation-item" data-recommendation-id="${escapeHtml(item.id)}">
          <span><b>${escapeHtml(item.spare_name)}</b><br>Ref: <b>${escapeHtml(item.reference_number)}</b></span>
          <button type="button" data-confirm-recommendation="${escapeHtml(item.id)}">Service Requirements</button>
        </div>`).join("")}`;
    panel.addEventListener("click", event => {
      event.stopPropagation();
      const button = event.target.closest("[data-confirm-recommendation]");
      if (!button) return;
      confirmSpareRecommendation(button.dataset.confirmRecommendation, button);
    });
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    card.appendChild(panel);
  }

  async function enhanceCustomerMachineExpenseCards() {
    if (window.location.pathname !== "/portal/dashboard") return;
    const machines = await loadCustomerExpenseMachines();
    if (!machines.length) return;

    const buttons = Array.from(document.querySelectorAll("button"));
    buttons
      .filter(button => /^\s*\+\s*(?:Request service|Spare & Service Request)\s*$/i.test(button.textContent || ""))
      .forEach(button => {
        button.hidden = true;
        button.dataset.belmReplacedByMachineService = "1";
      });
    machines.forEach(machine => {
      const model = String(machine.model || "").trim();
      const serial = String(machine.serialNumber || machine.serial_number || "").trim();
      if (!model) return;
      const card = buttons.find(button => {
        if (button.dataset.belmMachineExpenseReady === "1") return false;
        const text = button.textContent || "";
        if (!text.includes(model)) return false;
        if (serial && !text.includes(serial)) return false;
        return /last checked|never checked/i.test(text);
      });
      if (!card) return;

      card.dataset.belmMachineExpenseReady = "1";
      card.classList.add("belm-customer-machine-card");
      card.dataset.belmMachineId = String(machine.id || "");
      card.classList.add(`status-${technicianCondition(machine.status).status.toLowerCase()}`);
      card.firstElementChild?.classList.add("belm-machine-native-head");
      if (card.children[1]) card.children[1].classList.add("belm-machine-last-checked");
      // The whole card is a native <button> that navigates somewhere
      // broken/blank on click — tapping ANY part of it (even plain text
      // like "MACHINE STATUS" that was never meant to be clickable)
      // triggers that. Capture-phase here means we intercept before the
      // button's own handler ever runs, for every click except a genuine
      // link (<a href>, like "Procurement"/"Fuel Usage") — those are
      // real, intended navigation and are left alone.
      card.addEventListener("click", (event) => {
        const nestedButton = event.target.closest("button");
        const nestedLink = event.target.closest("a[href]");
        // Anything that landed on one of OUR injected buttons/links
        // (nested inside the card, not the card itself) is real,
        // intended interaction — let it proceed normally. Only a click
        // that lands directly on the card's own inert surface (plain
        // text/divs the card itself renders) gets blocked.
        if ((nestedButton && nestedButton !== card) || nestedLink) return;
        // stopImmediatePropagation (not just stopPropagation) matters
        // here: the card's own native click handler is registered on
        // this SAME element, so a plain stopPropagation wouldn't stop
        // that other listener on the same node from still firing.
        event.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
      }, true);
      customerMachineInfoCard(card, machine);
      customerServiceDuePanel(card, machine);
      customerSpareRecommendationsPanel(card, machine);
      decorateMachineActionIcons(card);
    });

    // Force the machine cards into a 2-column grid (customers can have
    // several machines) by finding their true shared ancestor — walking
    // up from one card until an element is found that actually CONTAINS
    // every other machine card too, not just assuming the immediate
    // parent is shared.
    const allCards = Array.from(document.querySelectorAll(".belm-customer-machine-card"));
    if (allCards.length >= 1) {
      let ancestor = allCards[0].parentElement;
      while (ancestor && !allCards.every(c => ancestor.contains(c))) {
        ancestor = ancestor.parentElement;
      }
      // Safety check: only grid-ify if this ancestor's direct children are
      // roughly just the cards themselves — avoids accidentally turning a
      // much bigger, unrelated section of the page into a 2-col grid if
      // the true shared ancestor turns out to be very high up the tree.
      if (ancestor && ancestor.children.length <= allCards.length + 2
          && !ancestor.classList.contains("belm-customer-machine-grid")) {
        ancestor.classList.add("belm-customer-machine-grid");
      }
    }
  }

  async function loadTechnicianCustomerProfile() {
    if (technicianCustomerProfile) return technicianCustomerProfile;
    if (technicianCustomerProfilePromise) return technicianCustomerProfilePromise;
    const token = localStorage.getItem("belm_tech_token");
    if (!token) return null;
    let techUser = {};
    try {
      techUser = JSON.parse(localStorage.getItem("belm_tech_user") || "{}");
    } catch (_) {}
    const payload = tokenPayload("belm_tech_token") || {};
    const customerId = techUser.assignedCustomerId || payload.assignedCustomerId;
    if (!customerId) return null;

    technicianCustomerProfilePromise = fetch(`/api/customers/${encodeURIComponent(customerId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load assigned customer.");
        const customer = await response.json();
        technicianCustomerProfile = customer;
        technicianReportMachines = Array.isArray(customer.machines) ? customer.machines : [];
        return technicianCustomerProfile;
      })
      .catch(() => {
        technicianCustomerProfilePromise = null;
        return null;
      });
    return technicianCustomerProfilePromise;
  }

  async function loadTechnicianReportMachines() {
    if (technicianReportMachines) return technicianReportMachines;
    if (technicianReportMachinesPromise) return technicianReportMachinesPromise;
    technicianReportMachinesPromise = loadTechnicianCustomerProfile()
      .then(customer => Array.isArray(customer?.machines) ? customer.machines : [])
      .finally(() => {
        technicianReportMachinesPromise = null;
      });
    return technicianReportMachinesPromise;
  }

  function technicianCondition(status) {
    const normalized = String(status || "UNKNOWN").toUpperCase();
    const conditions = {
      GREEN: {
        label: "Good condition",
        note: "Machine is operational.",
      },
      YELLOW: {
        label: "Needs attention",
        note: "Inspection or maintenance action is required.",
      },
      RED: {
        label: "Critical condition",
        note: "Do not operate until the fault is corrected.",
      },
      UNKNOWN: {
        label: "Not inspected",
        note: "Complete a checklist to confirm the condition.",
      },
    };
    return {
      status: normalized,
      ...(conditions[normalized] || conditions.UNKNOWN),
    };
  }

  function technicianCustomerInfoCard(customer) {
    if (document.getElementById("belmTechnicianCustomerCard")) return;
    const title = Array.from(document.querySelectorAll("h2"))
      .find(heading => (heading.textContent || "").trim() === String(customer.name || "").trim());
    if (!title) return;
    const titleRow = title.parentElement;
    const page = titleRow?.parentElement;
    if (!page) return;

    page.classList.add("belm-technician-dashboard-shell");
    const machineGrid = Array.from(page.children)
      .find(element => element.classList.contains("grid") && element.querySelector("button"));
    if (!machineGrid) return;

    const customerCard = document.createElement("section");
    customerCard.id = "belmTechnicianCustomerCard";
    customerCard.className = "belm-technician-customer-card";
    customerCard.innerHTML = `
      <div class="belm-technician-customer-head">
        <div>
          <span>Assigned Customer</span>
          <h1>${escapeHtml(customer.name || "Customer")}</h1>
          <p>${escapeHtml(customer.address || "Location not recorded")}</p>
        </div>
        <strong>${Number(customer.isActive ?? 1) === 1 ? "ACTIVE" : "INACTIVE"}</strong>
      </div>
      <div class="belm-technician-customer-info">
        <div><span>Location</span><b>${escapeHtml(customer.address || "Not recorded")}</b></div>
        <div><span>Phone</span><b>${escapeHtml(customer.phone || "Not recorded")}</b></div>
        <div><span>Email</span><b>${escapeHtml(customer.email || "Not recorded")}</b></div>
        <div><span>TIN / VRN</span><b>${escapeHtml([customer.tinNumber, customer.vrn].filter(Boolean).join(" / ") || "Not recorded")}</b></div>
        <div><span>Registered Machines</span><b>${escapeHtml((customer.machines || []).length)}</b></div>
      </div>`;

    const listHeading = document.createElement("div");
    listHeading.id = "belmTechnicianMachineListHeading";
    listHeading.className = "belm-technician-machine-list-heading";
    listHeading.innerHTML = `<div><span>Customer Fleet</span><h2>${escapeHtml((customer.name || "Customer").toUpperCase())} MACHINES</h2></div>
      <strong>${escapeHtml((customer.machines || []).length)} MACHINE(S)</strong>`;
    machineGrid.classList.add("belm-technician-machine-grid");
    machineGrid.before(customerCard, listHeading);
  }

  function technicianMachineInfoCard(card, machine) {
    if (card.dataset.belmTechnicianInfoReady === "1") return;
    card.dataset.belmTechnicianInfoReady = "1";
    // Any click that results in this card's own native "open checklist"
    // action (a direct tap on the card OR our injected "Check-up" button
    // re-firing card.click()) reliably tells us which machine is about to
    // be checked — capture phase so it fires before any child's
    // stopPropagation. This is far more reliable than trying to guess the
    // machine later from page text once the checklist form has opened.
    card.addEventListener("click", () => {
      try {
        sessionStorage.setItem("belm_current_checkup_machine_id", machine.id);
      } catch (_) {}
    }, true);
    const condition = technicianCondition(machine.status);
    const opStatus = String(machine.operationalStatus || machine.operational_status || "NORMAL").toUpperCase();
    const opLabels = {
      NORMAL: "Normal", SERVICE_IN_PROGRESS: "Service in progress", CHECKUP_IN_PROGRESS: "Check-up in progress",
      MAINTENANCE_IN_PROGRESS: "Maintenance in progress", GROUNDED: "Grounded (not operational)",
    };
    const details = document.createElement("div");
    details.className = "belm-technician-machine-info";
    details.innerHTML = `
      <div class="belm-technician-machine-data">
        <div><span>Brand</span><b>${escapeHtml(machine.brand || "Not recorded")}</b></div>
        <div><span>Machine Type</span><b>${escapeHtml(machine.machineType || machine.machine_type || "Not recorded")}</b></div>
        <div><span>Serial No.</span><b>${escapeHtml(machine.serialNumber || machine.serial_number || "Not recorded")}</b></div>
        <div><span>Registration</span><b>${escapeHtml(machine.regNumber || machine.reg_number || "Not recorded")}</b></div>
        <div><span>Service Kit</span><b>${escapeHtml(machine.serviceKit || machine.service_kit || "Not recorded")}</b></div>
        <div><span>Last Checked</span><b>${escapeHtml(machine.lastCheckedAt || machine.last_checked_at
          ? new Date(machine.lastCheckedAt || machine.last_checked_at).toLocaleDateString()
          : "Never checked")}</b></div>
      </div>
      <div class="belm-technician-machine-health status-${escapeHtml(condition.status.toLowerCase())}">
        <div><span>Machine Status</span><strong>${escapeHtml(condition.status)}</strong></div>
        <div><span>Condition</span><strong>${escapeHtml(condition.label)}</strong><small>${escapeHtml(condition.note)}</small></div>
      </div>
      <div class="belm-technician-op-status">
        <span>Activity status <small>(customer sees this update live)</small></span>
        <select data-belm-op-status="${escapeHtml(machine.id)}">
          ${Object.entries(opLabels).map(([value, label]) =>
            `<option value="${value}" ${value === opStatus ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>`;
    card.appendChild(details);
    // The whole card is itself a native button that opens the checklist
    // form on click. Without this, tapping our injected content (the
    // Activity Status dropdown especially) bubbles up and opens the
    // checklist by accident instead of doing what was actually tapped.
    details.addEventListener("click", (event) => event.stopPropagation());
    details.addEventListener("pointerdown", (event) => event.stopPropagation());
    details.querySelector("[data-belm-op-status]").addEventListener("change", async (event) => {
      const select = event.target;
      const token = localStorage.getItem("belm_tech_token");
      select.disabled = true;
      try {
        const response = await fetch(`/api/customers/machines/${machine.id}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ operationalStatus: select.value }),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not update status.");
      } catch (error) {
        alert(error.message || "Could not update machine activity status.");
      } finally {
        select.disabled = false;
      }
    });
  }

  function closeTechnicianReportHistory() {
    document.getElementById("belmTechnicianReportHistory")?.remove();
  }

  function renderTechnicianReportHistory(machine, reports) {
    closeTechnicianReportHistory();
    const machineName = [machine.brand, machine.model].filter(Boolean).join(" ") || machine.model || "Machine";
    const history = document.createElement("div");
    history.id = "belmTechnicianReportHistory";
    history.className = "belm-checked-report-modal";
    history.setAttribute("role", "dialog");
    history.setAttribute("aria-modal", "true");
    history.setAttribute("aria-labelledby", "belmTechnicianReportTitle");
    history.innerHTML = `<section class="belm-checked-report-card belm-report-history-card">
      <header class="belm-checked-report-head">
        <div>
          <p>BELM Technician · completed inspections</p>
          <h2 id="belmTechnicianReportTitle">${escapeHtml(machineName)} — Checklist Reports</h2>
          <span>${escapeHtml(machine.machineType || machine.machine_type || "")} · ${escapeHtml(machine.serialNumber || machine.serial_number || machine.regNumber || machine.reg_number || "No serial recorded")}</span>
        </div>
        <button type="button" data-close-report-history aria-label="Close checklist reports">×</button>
      </header>
      <div class="belm-report-history-list">${reports.length ? reports.map((report) => {
        const reportStatus = String(report.overallStatus || report.overall_status || "GREEN").toUpperCase();
        const createdAt = report.createdAt || report.created_at;
        const editStatus = report.isExpired
          ? "Expired / No Edit"
          : report.canEdit
            ? `Editable until ${formatTanzaniaDateTime(report.expiresAt)}`
            : "Read-only";
        return `<article class="belm-report-history-item">
          <div>
            <strong>${escapeHtml(report.templateName || "Checked machine report")}</strong>
            <span>${escapeHtml(createdAt ? new Date(createdAt).toLocaleString() : "Date not recorded")}</span>
            <small>Technician: ${escapeHtml(report.filledBy || report.filled_by || "Not recorded")} · Hour meter: ${escapeHtml(report.hourMeterReading ?? report.hour_meter_reading ?? "—")} · ${escapeHtml(editStatus)}</small>
          </div>
          <span class="belm-report-status status-${escapeHtml(reportStatus.toLowerCase())}">${escapeHtml(reportStatus)}</span>
          <button type="button" data-view-technician-report="${escapeHtml(report.id)}">View Checked Report</button>
        </article>`;
      }).join("") : '<div class="belm-report-empty">No completed checklist reports found for this machine.</div>'}</div>
      <footer class="belm-checked-report-actions">
        <button type="button" class="primary" data-close-report-history>Close</button>
      </footer>
    </section>`;

    history.addEventListener("click", (event) => {
      if (event.target === history || event.target.closest("[data-close-report-history]")) {
        closeTechnicianReportHistory();
        return;
      }
      const viewButton = event.target.closest("[data-view-technician-report]");
      if (!viewButton) return;
      const report = reports.find((item) => String(item.id) === viewButton.dataset.viewTechnicianReport);
      if (!report) return;
      closeTechnicianReportHistory();
      renderCheckedReport(report);
    });
    document.body.appendChild(history);
    history.querySelector("[data-close-report-history]")?.focus();
  }

  async function openTechnicianReportHistory(machine, trigger) {
    const token = localStorage.getItem("belm_tech_token");
    if (!token) {
      window.location.href = "/tech";
      return;
    }
    const originalText = trigger.textContent;
    trigger.textContent = "Loading…";
    trigger.setAttribute("aria-disabled", "true");
    try {
      const response = await fetch(`/api/checklist-reports/machine/${encodeURIComponent(machine.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const reports = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(reports.error || "Could not load checklist reports.");
      }
      renderTechnicianReportHistory(machine, Array.isArray(reports) ? reports : []);
    } catch (error) {
      alert(error.message || "Could not load checklist reports.");
    } finally {
      trigger.textContent = originalText;
      trigger.removeAttribute("aria-disabled");
    }
  }

  async function enhanceTechnicianReportCards() {
    if (!window.location.pathname.startsWith("/tech")) return;
    const customer = await loadTechnicianCustomerProfile();
    if (!customer) return;
    technicianCustomerInfoCard(customer);
    const machines = Array.isArray(customer.machines) ? customer.machines : [];
    if (!machines.length) return;
    const buttons = Array.from(document.querySelectorAll("button"));
    machines.forEach(machine => {
      const model = String(machine.model || "").trim();
      const serial = String(machine.serialNumber || machine.serial_number || "").trim();
      if (!model) return;
      const card = buttons.find(button => {
        if (button.dataset.belmTechnicianReportsReady === "1") return false;
        const text = button.textContent || "";
        return text.includes(model) && (!serial || text.includes(serial));
      });
      if (!card) return;

      card.dataset.belmTechnicianReportsReady = "1";
      card.classList.add("belm-technician-machine-card");
      card.classList.add(`status-${technicianCondition(machine.status).status.toLowerCase()}`);
      card.firstElementChild?.classList.add("belm-machine-native-head");
      if (card.children[1]) card.children[1].classList.add("belm-machine-last-checked");
      technicianMachineInfoCard(card, machine);
      technicianServiceDuePanel(card, machine);

      const actionsRow = document.createElement("div");
      actionsRow.className = "belm-technician-card-actions";

      const reportLink = document.createElement("span");
      reportLink.className = "belm-technician-report-link";
      reportLink.setAttribute("role", "button");
      reportLink.setAttribute("tabindex", "0");
      reportLink.textContent = "Checked Reports";
      reportLink.title = `View completed checklist reports for ${model}`;
      const openReports = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        openTechnicianReportHistory(machine, reportLink);
      };
      reportLink.addEventListener("click", openReports);
      reportLink.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") openReports(event);
      });

      // Explicit "Check-up" button — re-fires the card's own native click
      // (which is what already opens the checklist form) through a clear,
      // dedicated blue button instead of relying on tapping bare card
      // space, which now risks landing on the Activity Status dropdown
      // or the Checked Reports link instead.
      const checkupButton = document.createElement("button");
      checkupButton.type = "button";
      checkupButton.className = "belm-technician-checkup-button";
      checkupButton.textContent = "Check-up";
      checkupButton.title = `Start a check-up for ${model}`;
      checkupButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        card.click();
      });

      const workflowButton = document.createElement("button");
      workflowButton.type = "button";
      workflowButton.className = "belm-technician-checkup-button";
      workflowButton.textContent = "My Job Cards";
      workflowButton.title = `Open your assigned Job Cards for ${model}`;
      workflowButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        window.location.href = `/technician-job-cards/?machine=${encodeURIComponent(machine.id)}`;
      });

      actionsRow.appendChild(reportLink);
      actionsRow.appendChild(checkupButton);
      actionsRow.appendChild(workflowButton);
      card.appendChild(actionsRow);
    });
  }

  function renderSavedReportLoadError() {
    alert("Checklist was saved, but its Checked Report could not open automatically. Select Checked Reports on the machine card to view it.");
  }

  async function openSavedTechnicianReport(reportId, machineId, attempt = 0) {
    const token = localStorage.getItem("belm_tech_token");
    if (!token || !reportId || !machineId) return;
    try {
      const response = await fetch(`/api/checklist-reports/machine/${encodeURIComponent(machineId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const reports = await response.json().catch(() => []);
      if (!response.ok || !Array.isArray(reports)) throw new Error("Checked Report unavailable.");
      const savedReport = reports.find((report) => String(report.id) === String(reportId));
      if (!savedReport) throw new Error("Saved report has not appeared yet.");
      renderCheckedReport(savedReport);
    } catch (_) {
      const retryDelays = [150, 350, 700, 1200];
      if (attempt < retryDelays.length) {
        window.setTimeout(
          () => openSavedTechnicianReport(reportId, machineId, attempt + 1),
          retryDelays[attempt]
        );
      } else {
        renderSavedReportLoadError();
      }
    }
  }

  function installTechnicianSavedReportViewer() {
    if (!window.location.pathname.startsWith("/tech")) return;
    if (document.documentElement.dataset.belmChecklistSaveViewer === "ready") return;
    const Xhr = window.XMLHttpRequest;
    if (!Xhr?.prototype?.open || !Xhr?.prototype?.send) return;
    document.documentElement.dataset.belmChecklistSaveViewer = "ready";

    const originalOpen = Xhr.prototype.open;
    const originalSend = Xhr.prototype.send;
    Xhr.prototype.open = function (method, url, ...rest) {
      let requestUrl = String(url || "");
      try {
        requestUrl = new URL(requestUrl, window.location.origin).pathname;
      } catch (_) {
        requestUrl = requestUrl.split("?")[0];
      }
      requestUrl = requestUrl.replace(/\/+$/, "");
      this.belmChecklistSaveRequest =
        String(method || "").toUpperCase() === "POST"
        && (requestUrl === "/api/checklist-reports" || requestUrl === "/checklist-reports");
      return originalOpen.call(this, method, url, ...rest);
    };
    Xhr.prototype.send = function (body) {
      if (this.belmChecklistSaveRequest) {
        let request = {};
        try {
          request = typeof body === "string" ? JSON.parse(body) : {};
        } catch (_) {}
        const machineId = request.machineId;
        this.addEventListener("loadend", () => {
          if (this.status < 200 || this.status >= 300) return;
          let saved = this.response && typeof this.response === "object"
            ? this.response
            : null;
          if (!saved) {
            try {
              const responseText = typeof this.response === "string"
                ? this.response
                : this.responseText;
              saved = JSON.parse(responseText || "{}");
            } catch (_) {
              saved = {};
            }
          }
          if (!saved?.id || !machineId) return;
          window.setTimeout(() => {
            if (saved.machine && Array.isArray(saved.answers)) {
              renderCheckedReport(saved);
            } else {
              openSavedTechnicianReport(saved.id, machineId);
            }
          }, 40);
        }, { once: true });
      }
      return originalSend.call(this, body);
    };
  }

  function redirectChecklistManager() {
    if (window.location.pathname === "/admin/checklist-templates") {
      window.location.replace("/checklist-manager/");
    }
  }

  function redirectServiceRequestManager() {
    if (window.location.pathname === "/admin/service-requests") {
      window.location.replace("/engineering-manager/#service-requests");
    }
  }

  function redirectBillingManager() {
    if (window.location.pathname === "/admin/billing") {
      window.location.replace("/billing-manager/");
    }
  }

  function redirectCustomersManager() {
    if (window.location.pathname === "/admin/customers") {
      window.location.replace("/customers-manager/");
    }
  }

  function redirectSparePartsManager() {
    if (window.location.pathname === "/admin/spare-parts") {
      window.location.replace("/spare-parts-manager/");
    }
  }

  function redirectRolesManager() {
    if (window.location.pathname === "/admin/roles") {
      window.location.replace("/roles-manager/");
    }
  }

  function redirectSuppliersManager() {
    if (window.location.pathname === "/admin/suppliers") {
      window.location.replace("/suppliers-manager/");
    }
  }

  function redirectOverviewManager() {
    if (window.location.pathname === "/admin/overview") {
      window.location.replace("/overview-manager/");
    }
  }

  function redirectReportsManager() {
    if (window.location.pathname === "/admin/reports") {
      window.location.replace("/reports-manager/");
    }
  }

  function redirectSettingsManager() {
    if (window.location.pathname === "/admin/settings") {
      window.location.replace("/settings-manager/");
    }
  }

  function removeLegacyOwnerRole() {
    document.querySelectorAll('select option[value="owner"]').forEach((option) => {
      option.remove();
    });
  }

  const CHECKLIST_PHOTO_MAX_SOURCE_BYTES = 12 * 1024 * 1024;
  const CHECKLIST_PHOTO_TARGET_BYTES = 450 * 1024;

  function dataUrlByteSize(dataUrl) {
    const encoded = String(dataUrl || "").split(",")[1] || "";
    return Math.ceil(encoded.length * 3 / 4);
  }

  function loadChecklistPhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The selected photo could not be read."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Select a valid JPG, PNG or WEBP photo."));
        image.onload = () => resolve(image);
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  async function compressChecklistPhoto(file) {
    if (!file || !String(file.type || "").startsWith("image/")) {
      throw new Error("Select an image file.");
    }
    if (file.size > CHECKLIST_PHOTO_MAX_SOURCE_BYTES) {
      throw new Error("Photo is above 12 MB. Select a smaller photo.");
    }

    const image = await loadChecklistPhoto(file);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot compress the selected photo.");

    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const longestSide = Math.max(imageWidth, imageHeight);
    let scale = Math.min(1, 1280 / Math.max(1, longestSide));
    let quality = 0.68;
    let compressed = "";

    for (let attempt = 0; attempt < 9; attempt += 1) {
      canvas.width = Math.max(1, Math.round(imageWidth * scale));
      canvas.height = Math.max(1, Math.round(imageHeight * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      compressed = canvas.toDataURL("image/jpeg", quality);
      if (dataUrlByteSize(compressed) <= CHECKLIST_PHOTO_TARGET_BYTES) break;
      if (quality > 0.42) {
        quality -= 0.08;
      } else {
        scale *= 0.78;
        quality = 0.56;
      }
    }

    const compressedBytes = dataUrlByteSize(compressed);
    if (!compressed || compressedBytes > 500 * 1024) {
      throw new Error("Photo could not be reduced enough. Crop it or select a smaller photo.");
    }
    return {
      dataUrl: compressed,
      originalBytes: file.size,
      compressedBytes,
    };
  }

  function setChecklistPhotoValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function improvePhotoInputs() {
    document.querySelectorAll(
      'input[placeholder="Photo upload — wire up file input for production"], input[data-checklist-photo="1"]'
    ).forEach((input) => {
      if (
        input.dataset.belmPhotoUploader === "ready"
        && input.parentElement?.querySelector(".belm-checklist-photo-uploader")
      ) return;

      input.dataset.belmPhotoUploader = "ready";
      const wasRequired = input.required;
      const existingPhoto = String(input.value || "").trim();
      input.required = false;
      input.hidden = true;
      input.tabIndex = -1;

      const uploader = document.createElement("div");
      uploader.className = "belm-checklist-photo-uploader";
      uploader.innerHTML = `
        <label class="belm-checklist-photo-picker">
          <span>Upload low-MB photo</span>
          <small>JPG, PNG or WEBP · compressed automatically below about 0.5 MB</small>
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" />
        </label>
        <div class="belm-checklist-photo-preview"${existingPhoto ? "" : " hidden"}>
          <img alt="Checklist photo preview" />
          <span>${existingPhoto ? "Existing photo ready. Select another photo to replace it." : ""}</span>
        </div>
        <p class="belm-checklist-photo-error" role="alert" hidden></p>`;
      input.insertAdjacentElement("afterend", uploader);

      const fileInput = uploader.querySelector('input[type="file"]');
      const preview = uploader.querySelector(".belm-checklist-photo-preview");
      const previewImage = preview.querySelector("img");
      const previewText = preview.querySelector("span");
      const errorBox = uploader.querySelector(".belm-checklist-photo-error");
      fileInput.required = wasRequired && !existingPhoto;
      if (existingPhoto && safeReportPhotoUrl(existingPhoto)) previewImage.src = existingPhoto;

      fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        fileInput.disabled = true;
        errorBox.hidden = true;
        preview.hidden = false;
        previewImage.removeAttribute("src");
        previewText.textContent = "Compressing photo…";
        try {
          const result = await compressChecklistPhoto(file);
          setChecklistPhotoValue(input, result.dataUrl);
          fileInput.required = false;
          previewImage.src = result.dataUrl;
          previewText.textContent = `Ready · ${(result.originalBytes / 1024 / 1024).toFixed(2)} MB reduced to ${Math.ceil(result.compressedBytes / 1024)} KB`;
        } catch (error) {
          setChecklistPhotoValue(input, "");
          fileInput.value = "";
          fileInput.required = wasRequired;
          preview.hidden = true;
          errorBox.textContent = error.message || "Photo could not be prepared.";
          errorBox.hidden = false;
        } finally {
          fileInput.disabled = false;
        }
      });
    });
  }

  function enforceViewerInterface() {
    const payload = tokenPayload("belm_customer_token");
    if (!payload || String(payload.customerRole || "").toLowerCase() !== "viewer") return;

    document.querySelectorAll("button").forEach((button) => {
      const text = (button.textContent || "").trim().toLowerCase();
      if (text.includes("request service") || text.includes("spare & service request") || (text === "cancel" && button.classList.contains("text-red-600"))) {
        button.hidden = true;
        button.disabled = true;
      }
    });
  }

  function correctLegacyCopy() {
    if (window.location.pathname === "/admin/activity-log") {
      document.querySelectorAll("p").forEach((paragraph) => {
        if ((paragraph.textContent || "").includes("needs a dedicated /api/activity-log")) {
          paragraph.textContent = "Shows the latest checklist submissions recorded by BELM Technicians.";
        }
      });
    }

    if (window.location.pathname === "/admin/suppliers") {
      document.querySelectorAll("p").forEach((paragraph) => {
        if ((paragraph.textContent || "").includes("static-hosted frontend")) {
          paragraph.textContent = "Use these shortcuts to search public supplier, datasheet and parts-diagram sources, then save verified supplier details below.";
        }
      });
    }

    if (window.location.pathname === "/admin/roles/recycle-bin") {
      document.querySelectorAll("p").forEach((paragraph) => {
        if ((paragraph.textContent || "").includes("purged automatically")) {
          paragraph.textContent = "Deleted items remain here until a Super Admin restores or permanently deletes them.";
        }
      });
      document.querySelectorAll("th").forEach((heading) => {
        if ((heading.textContent || "").trim() === "Days left") heading.textContent = "Retention";
      });
      document.querySelectorAll("tbody td").forEach((cell) => {
        if (/^\d+\s+day\(s\)$/.test((cell.textContent || "").trim())) cell.textContent = "Manual";
      });

      let adminRole = "";
      try {
        adminRole = JSON.parse(localStorage.getItem("belm_admin_user") || "{}").role || "";
      } catch (_) {}
      if (adminRole !== "Super Admin") {
        document.querySelectorAll("tbody button").forEach((button) => {
          button.hidden = true;
          button.disabled = true;
        });
      }
    }
  }

  function safeReportPhotoUrl(value) {
    const photoUrl = String(value || "").trim();
    if (!photoUrl) return "";
    if (
      photoUrl.length <= 700000
      && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(photoUrl)
    ) return photoUrl;
    if (photoUrl.startsWith("/")) return photoUrl;
    try {
      const parsed = new URL(photoUrl);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch (_) {
      return "";
    }
  }

  function closeCheckedReport() {
    document.getElementById("belmCheckedReportModal")?.remove();
  }

  function formatTanzaniaDateTime(value) {
    if (!value) return "Not recorded";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not recorded";
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Dar_es_Salaam",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    return `${get("day")}/${get("month")}/${get("year")}, ${get("hour")}:${get("minute")}`;
  }

  function formatTanzaniaDate(value) {
    if (!value) return "Not recorded";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not recorded";
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Dar_es_Salaam",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    return `${get("day")}/${get("month")}/${get("year")}`;
  }

  function checklistEditControl(answer, index) {
    const inputType = String(answer.inputType || answer.input_type || "TEXT").toUpperCase();
    const value = String(answer.value ?? "");
    const options = Array.isArray(answer.options) ? answer.options.map(String) : [];
    const required = answer.isRequired || answer.is_required ? " required" : "";
    const inputId = `belmChecklistAnswer${index}`;
    const common = `id="${inputId}" data-checklist-answer="${index}"${required}`;

    if (inputType === "DROPDOWN" || inputType === "YES_NO") {
      const selectOptions = options.length ? options : (inputType === "YES_NO" ? ["Yes", "No"] : []);
      if (value && !selectOptions.includes(value)) selectOptions.unshift(value);
      return `<select ${common}>
        <option value="">Select result</option>
        ${selectOptions.map((option) => `<option value="${escapeHtml(option)}"${option === value ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>`;
    }
    if (inputType === "NUMBER") {
      return `<input ${common} type="number" step="any" value="${escapeHtml(value)}" />`;
    }
    if (inputType === "DATE") {
      return `<input ${common} type="date" value="${escapeHtml(value)}" />`;
    }
    if (inputType === "PHOTO") {
      const photoValue = answer.photoUrl || answer.photo_url || value;
      return `<input ${common} type="text" value="${escapeHtml(photoValue)}"
        data-checklist-photo="1" placeholder="Photo upload — wire up file input for production" />`;
    }
    return `<input ${common} type="text" value="${escapeHtml(value)}" />`;
  }

  function renderChecklistEdit(report) {
    if (!report.canEdit || report.isExpired) {
      renderCheckedReport({ ...report, canEdit: false, isExpired: true });
      return;
    }

    closeCheckedReport();
    const machine = report.machine || {};
    const machineName = [machine.brand, machine.model].filter(Boolean).join(" ")
      || report.machineModel
      || "Machine";
    const answers = Array.isArray(report.answers) ? report.answers : [];
    const modal = document.createElement("div");
    modal.id = "belmCheckedReportModal";
    modal.className = "belm-checked-report-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "belmChecklistEditTitle");
    modal.innerHTML = `<section class="belm-checked-report-card">
      <header class="belm-checked-report-head">
        <div>
          <p>BELM Technician · same-day correction</p>
          <h2 id="belmChecklistEditTitle">Edit ${escapeHtml(machineName)} Checklist</h2>
          <span>Editable until ${escapeHtml(formatTanzaniaDateTime(report.expiresAt))} Tanzania time</span>
        </div>
        <button type="button" data-cancel-checklist-edit aria-label="Cancel checklist editing">×</button>
      </header>
      <form class="belm-checklist-edit-form">
        <div class="belm-checklist-edit-deadline">
          <strong>Editing closes automatically at 00:00</strong>
          <span>After this deadline the checklist becomes Expired / No Edit.</span>
        </div>
        <label class="belm-checklist-edit-meter">
          <span>Hour meter reading</span>
          <input name="hourMeterReading" type="number" min="0" step="any"
            value="${escapeHtml(report.hourMeterReading ?? report.hour_meter_reading ?? "")}" required />
        </label>
        <div class="belm-checklist-edit-items">${answers.length ? answers.map((answer, index) => `
          <label class="belm-checklist-edit-item" for="belmChecklistAnswer${index}">
            <span>${escapeHtml(answer.label || "Checklist item")}${answer.isRequired || answer.is_required ? " *" : ""}</span>
            ${checklistEditControl(answer, index)}
          </label>`).join("") : '<div class="belm-report-empty">No checklist items are available to edit.</div>'}</div>
        <p class="belm-checklist-edit-error" role="alert" hidden></p>
        <footer class="belm-checked-report-actions">
          <button type="button" data-cancel-checklist-edit>Cancel</button>
          <button type="submit" class="primary">Save Changes</button>
        </footer>
      </form>
    </section>`;

    const cancel = () => renderCheckedReport(report);
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-cancel-checklist-edit]")) cancel();
    });
    modal.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('button[type="submit"]');
      const errorBox = form.querySelector(".belm-checklist-edit-error");
      const token = localStorage.getItem("belm_tech_token");
      if (!token) {
        window.location.href = "/tech";
        return;
      }

      const payloadAnswers = answers.map((answer, index) => {
        const input = form.querySelector(`[data-checklist-answer="${index}"]`);
        const inputType = String(answer.inputType || answer.input_type || "TEXT").toUpperCase();
        const inputValue = String(input?.value ?? "").trim();
        return {
          templateItemId: answer.templateItemId || answer.template_item_id,
          label: answer.label || "Checklist item",
          value: inputType === "PHOTO" ? "" : inputValue,
          photoUrl: inputType === "PHOTO"
            ? inputValue
            : (answer.photoUrl || answer.photo_url || null),
        };
      });

      submit.disabled = true;
      submit.textContent = "Saving…";
      errorBox.hidden = true;
      try {
        const response = await fetch(`/api/checklist-reports/${encodeURIComponent(report.id)}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            hourMeterReading: form.elements.hourMeterReading.value,
            answers: payloadAnswers,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 409) {
            report.canEdit = false;
            report.isExpired = true;
          }
          throw new Error(result.error || "Checklist changes could not be saved.");
        }

        const machineId = report.machineId || report.machine_id || machine.id;
        const refreshed = await fetch(`/api/checklist-reports/machine/${encodeURIComponent(machineId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const reports = await refreshed.json().catch(() => []);
        if (!refreshed.ok) throw new Error(reports.error || "Saved checklist could not be reloaded.");
        const updated = Array.isArray(reports)
          ? reports.find((item) => String(item.id) === String(report.id))
          : null;
        renderCheckedReport(updated || { ...report, ...result });
      } catch (error) {
        errorBox.textContent = error.message || "Checklist changes could not be saved.";
        errorBox.hidden = false;
        if (report.isExpired) {
          form.querySelectorAll("input, select").forEach((input) => {
            input.disabled = true;
          });
          submit.disabled = true;
          submit.textContent = "Expired / No Edit";
        } else {
          submit.disabled = false;
          submit.textContent = "Save Changes";
        }
      }
    });
    document.body.appendChild(modal);
    improvePhotoInputs();
    modal.querySelector('[name="hourMeterReading"]')?.focus();
  }

  async function downloadCheckedReportPdf(reportId, trigger) {
    const id = String(reportId || "").trim();
    if (!id) throw new Error("Checklist report ID is missing.");

    // Technician/Admin reports must use the staff checklist endpoint so the
    // request carries the correct Bearer token and the server-side branded
    // PDF generator (including the BELM background watermark) is used.
    const techToken = localStorage.getItem("belm_tech_token");
    const adminToken = localStorage.getItem("belm_admin_token");
    const customerToken = localStorage.getItem("belm_customer_token");
    const onTechnicianPortal = window.location.pathname.startsWith("/tech");
    const onCustomerPortal = window.location.pathname.startsWith("/portal");

    let token = null;
    let url = null;
    if (onTechnicianPortal && techToken) {
      token = techToken;
      url = `/api/checklist-reports/${encodeURIComponent(id)}/pdf`;
    } else if (!onCustomerPortal && adminToken) {
      token = adminToken;
      url = `/api/checklist-reports/${encodeURIComponent(id)}/pdf`;
    } else if (customerToken) {
      token = customerToken;
      url = `/api/customer-portal/reports/${encodeURIComponent(id)}/download`;
    } else if (techToken || adminToken) {
      token = techToken || adminToken;
      url = `/api/checklist-reports/${encodeURIComponent(id)}/pdf`;
    }

    if (!token || !url) throw new Error("Your report session has expired. Sign in again and retry.");

    const originalText = trigger?.textContent || "Download";
    if (trigger) {
      trigger.textContent = "Preparing...";
      trigger.setAttribute("aria-disabled", "true");
    }
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Could not prepare the checklist PDF.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const filename = customerPdfFilename(
        response.headers.get("Content-Disposition"),
        `BELM-checklist-report-${id}.pdf`
      );
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } finally {
      if (trigger) {
        trigger.textContent = originalText;
        trigger.removeAttribute("aria-disabled");
      }
    }
  }

  function renderCheckedReport(report) {
    closeCheckedReport();
    const machine = report.machine || {};
    const machineName = [machine.brand, machine.model].filter(Boolean).join(" ")
      || report.machineModel
      || "Machine";
    const serialReference = machine.serialNumber || machine.regNumber || "Not recorded";
    const status = String(report.overallStatus || report.overall_status || "GREEN").toUpperCase();
    const answers = Array.isArray(report.answers) ? report.answers : [];
    const createdAt = report.createdAt || report.created_at;
    const formattedDate = createdAt ? formatTanzaniaDateTime(createdAt) : "Not recorded";
    const filledBy = report.filledBy || report.filled_by || "Not recorded";
    const hourMeter = report.hourMeterReading ?? report.hour_meter_reading ?? "Not recorded";
    const editState = report.isExpired
      ? "Expired / No Edit"
      : report.canEdit
        ? `Editable until ${formatTanzaniaDateTime(report.expiresAt)}`
        : "Read-only";
    const editStateClass = report.isExpired ? "expired" : report.canEdit ? "editable" : "readonly";
    const displayPhotoUrl = String(report.displayPhotoUrl || report.display_photo_url || "").trim();

    const modal = document.createElement("div");
    modal.id = "belmCheckedReportModal";
    modal.className = "belm-checked-report-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "belmCheckedReportTitle");
    modal.innerHTML = `<section class="belm-checked-report-card">
      <header class="belm-checked-report-head">
        <div>
          <p>Completed machine inspection</p>
          <h2 id="belmCheckedReportTitle">${report.customerName ? `${escapeHtml(report.customerName.toUpperCase())} — ` : ""}${escapeHtml(machineName)} Checked Report</h2>
          <span>${escapeHtml(report.customerName || "")}${report.customerName ? " · " : ""}${escapeHtml(report.templateName || "Checklist report")}</span>
        </div>
        <button type="button" data-close-checked-report aria-label="Close checked report">×</button>
      </header>
      <div class="belm-checked-report-summary">
        <div><span>Overall status</span><strong class="status-${escapeHtml(status.toLowerCase())}">${escapeHtml(status)}</strong></div>
        <div><span>Checked by</span><strong>${escapeHtml(filledBy)}</strong></div>
        <div><span>Date checked</span><strong>${escapeHtml(formattedDate)}</strong></div>
        <div><span>Last updated</span><strong>${report.updatedAt ? escapeHtml(formatTanzaniaDateTime(report.updatedAt)) : "—"}</strong></div>
        <div><span>Hour meter</span><strong>${escapeHtml(hourMeter)}</strong></div>
        <div><span>Machine type</span><strong>${escapeHtml(machine.machineType || "Not recorded")}</strong></div>
        <div><span>Serial / registration</span><strong>${escapeHtml(serialReference)}</strong></div>
        <div><span>Edit status</span><strong class="belm-edit-state ${editStateClass}">${escapeHtml(editState)}</strong></div>
        ${displayPhotoUrl ? `<div class="belm-checked-report-display-photo-cell"><span>Display photo</span><img src="${escapeHtml(displayPhotoUrl)}" alt="Display photo" class="belm-checked-report-display-photo" data-view-report-photo="${escapeHtml(displayPhotoUrl)}"></div>` : ""}
      </div>
      <div class="belm-checked-report-table-wrap">
        <table class="belm-checked-report-table">
          <thead><tr><th>Checked item</th><th>Recorded result</th><th>Status</th><th>Evidence</th></tr></thead>
          <tbody>${answers.length ? answers.map((answer, answerIndex) => {
            const answerStatus = String(answer.safetyLevel || answer.safety_level || "GREEN").toUpperCase();
            const photoUrl = safeReportPhotoUrl(answer.photoUrl || answer.photo_url);
            const rawValue = String(answer.value ?? "");
            const valueAsPhoto = /^data:image\//i.test(rawValue) ? safeReportPhotoUrl(rawValue) : "";
            const resultCell = valueAsPhoto
              ? `<img src="${escapeHtml(valueAsPhoto)}" alt="Photo for ${escapeHtml(answer.label || "checklist item")}" loading="lazy" class="belm-report-photo-thumb" data-view-report-photo="${escapeHtml(valueAsPhoto)}">`
              : `<strong>${escapeHtml(rawValue || "—")}</strong>`;
            return `<tr>
              <td>${answerIndex + 1}. ${escapeHtml(answer.label || "Checklist item")}</td>
              <td>${resultCell}${String(answer.note || "").trim() ? `<div class="belm-report-issue-note">Issue: ${escapeHtml(String(answer.note).trim())}</div>` : ""}</td>
              <td>${answerStatus === "NONE" ? "—" : `<span class="belm-report-status status-${escapeHtml(answerStatus.toLowerCase())}">${escapeHtml(answerStatus)}</span>`}</td>
              <td class="belm-report-evidence">${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="Evidence photo for ${escapeHtml(answer.label || "checklist item")}" loading="lazy" class="belm-report-photo-thumb" data-view-report-photo="${escapeHtml(photoUrl)}">` : "—"}</td>
            </tr>`;
          }).join("") : '<tr><td colspan="4" class="belm-report-empty">No checked answers were recorded.</td></tr>'}</tbody>
        </table>
      </div>
      <footer class="belm-checked-report-actions">
        <button type="button" data-print-checked-report>Print Report</button>
        <a href="#" data-checked-report-download data-report-id="${escapeHtml(report.id)}">Download</a>
        ${report.canEdit && !report.isExpired ? '<button type="button" data-edit-checked-report>Edit Checklist</button>' : ""}
        <button type="button" class="primary" data-close-checked-report>Close</button>
      </footer>
    </section>`;

    modal.addEventListener("click", (event) => {
      const downloadLink = event.target.closest("[data-checked-report-download]");
      if (downloadLink) {
        event.preventDefault();
        if (downloadLink.getAttribute("aria-disabled") === "true") return;
        downloadCheckedReportPdf(downloadLink.dataset.reportId || report.id, downloadLink)
          .catch((error) => alert(error.message || "Could not download the checklist report."));
        return;
      }
      const photoThumb = event.target.closest("[data-view-report-photo]");
      if (photoThumb) {
        openReportPhotoLightbox(photoThumb.dataset.viewReportPhoto);
        return;
      }
      if (event.target === modal || event.target.closest("[data-close-checked-report]")) {
        closeCheckedReport();
      }
      if (event.target.closest("[data-print-checked-report]")) window.print();
      if (event.target.closest("[data-edit-checked-report]")) renderChecklistEdit(report);
    });
    document.body.appendChild(modal);
    modal.querySelector("[data-close-checked-report]")?.focus();
  }

  // In-page lightbox for evidence/displayer photos. Chrome (and some
  // other browsers) blocks top-level navigation to large data: URLs
  // opened via target="_blank" and silently downloads the file instead
  // of showing it — this avoids that entirely by never navigating.
  function openReportPhotoLightbox(photoUrl) {
    let overlay = document.getElementById("belmReportPhotoLightbox");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "belmReportPhotoLightbox";
      overlay.className = "belm-report-photo-lightbox";
      overlay.innerHTML = `
        <button type="button" class="belm-report-photo-lightbox-close" aria-label="Close">×</button>
        <img alt="Photo — full size">`;
      document.body.appendChild(overlay);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay || event.target.closest(".belm-report-photo-lightbox-close")) {
          overlay.classList.remove("open");
        }
      });
    }
    overlay.querySelector("img").src = photoUrl;
    overlay.classList.add("open");
  }

  function enhanceCheckedReportButtons() {
    if (window.location.pathname !== "/portal/dashboard") return;
    // De-duplicate first: if the underlying app re-renders a download
    // link without fully removing our previously-inserted button, two
    // "View Checked Report" buttons can end up pointing at the same
    // report. Keep only one per unique report URL.
    const seenReportUrls = new Set();
    document.querySelectorAll(".belm-view-checked-report").forEach((button) => {
      const url = button.dataset.reportUrl;
      if (seenReportUrls.has(url)) {
        button.remove();
      } else {
        seenReportUrls.add(url);
      }
    });
    document.querySelectorAll('a[href^="/api/customer-portal/reports/"][href$="/download"]').forEach((downloadLink) => {
      const reportUrl = downloadLink.getAttribute("href").replace(/\/download$/, "/view");
      if (seenReportUrls.has(reportUrl)) return;
      if (downloadLink.parentElement?.querySelector(".belm-view-checked-report")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "belm-view-checked-report";
      button.dataset.reportUrl = reportUrl;
      button.textContent = "View Checked Report";
      downloadLink.parentElement?.insertBefore(button, downloadLink);
      seenReportUrls.add(reportUrl);
    });
  }

  function installCheckedReportViewer() {
    if (document.documentElement.dataset.belmCheckedReportViewer === "ready") return;
    document.documentElement.dataset.belmCheckedReportViewer = "ready";
    document.addEventListener("click", async (event) => {
      const button = event.target.closest(".belm-view-checked-report");
      if (!button) return;
      event.preventDefault();
      const token = localStorage.getItem("belm_customer_token");
      if (!token) {
        window.location.href = "/portal/login";
        return;
      }
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Loading report…";
      try {
        const response = await fetch(button.dataset.reportUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const report = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(report.error || "Could not load the checked report.");
        renderCheckedReport(report);
      } catch (error) {
        alert(error.message || "Could not load the checked report.");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    }, true);
  }

  function installAuthenticatedReportDownloads() {
    if (document.documentElement.dataset.belmReportDownload === "ready") return;
    document.documentElement.dataset.belmReportDownload = "ready";

    document.addEventListener("click", async (event) => {
      const link = event.target.closest('a[href^="/api/customer-portal/reports/"][href$="/download"]');
      if (!link) return;
      event.preventDefault();

      const token = localStorage.getItem("belm_customer_token");
      if (!token) {
        window.location.href = "/portal/login";
        return;
      }

      const originalText = link.textContent;
      link.textContent = "Downloading...";
      link.style.pointerEvents = "none";

      try {
        const response = await fetch(link.getAttribute("href"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          let message = "Could not download this report.";
          try {
            const error = await response.json();
            message = error.error || message;
          } catch (_) {}
          throw new Error(message);
        }

        const blob = await response.blob();
        const reportId = (link.getAttribute("href").match(/reports\/([^/]+)\/download/) || [])[1] || "report";
        const disposition = response.headers.get("Content-Disposition") || "";
        const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
        const objectUrl = URL.createObjectURL(blob);
        const download = document.createElement("a");
        download.href = objectUrl;
        download.download = filenameMatch ? filenameMatch[1] : `BELM-checklist-${reportId}.pdf`;
        document.body.appendChild(download);
        download.click();
        download.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        alert(error.message || "Could not download this report.");
      } finally {
        link.textContent = originalText;
        link.style.pointerEvents = "";
      }
    }, true);
  }

  async function addTechnicianTasksShortcut() {
    if (window.location.pathname !== "/tech") return;
    if (document.getElementById("belm-tech-tasks-shortcut")) return;

    const payload = tokenPayload("belm_tech_token");
    const token = localStorage.getItem("belm_tech_token");
    if (!payload || !token || String(payload.roleName || "").toLowerCase() !== "technician") return;

    const link = document.createElement("a");
    link.id = "belm-tech-tasks-shortcut";
    link.href = "/technician-tasks/";
    link.textContent = "My Tasks";
    Object.assign(link.style, {
      position: "fixed",
      right: "20px",
      bottom: "82px",
      zIndex: "1000",
      padding: "12px 18px",
      borderRadius: "999px",
      background: "#00aa5b",
      color: "#fff",
      fontWeight: "800",
      textDecoration: "none",
      boxShadow: "0 12px 30px rgba(0, 170, 91, .30)",
      border: "2px solid #f4cf00",
    });
    document.body.appendChild(link);

    try {
      const response = await fetch(`/api/tasks/user/${encodeURIComponent(payload.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const tasks = await response.json();
      const pending = Array.isArray(tasks)
        ? tasks.filter((task) => task.status !== "DONE").length
        : 0;
      if (pending > 0) link.textContent = `My Tasks (${pending})`;
    } catch (_) {}
  }

  async function addTechnicianJobCardsShortcut() {
    if (window.location.pathname !== "/tech") return;
    if (document.getElementById("belm-tech-jobcards-shortcut")) return;
    const payload = tokenPayload("belm_tech_token");
    const token = localStorage.getItem("belm_tech_token");
    if (!payload || !token || String(payload.roleName || "").toLowerCase() !== "technician") return;
    const link = document.createElement("a");
    link.id = "belm-tech-jobcards-shortcut";
    link.href = "/technician-job-cards/";
    link.textContent = "My Job Cards";
    Object.assign(link.style, {
      position: "fixed", right: "20px", bottom: "138px", zIndex: "1000",
      padding: "12px 18px", borderRadius: "999px", background: "#0b4f9c",
      color: "#fff", fontWeight: "800", textDecoration: "none",
      boxShadow: "0 12px 30px rgba(11, 79, 156, .28)", border: "2px solid #f4cf00",
    });
    document.body.appendChild(link);
    try {
      const response = await fetch('/api/breakdown-workflow/technician-jobs', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const rows = await response.json();
      const active = Array.isArray(rows) ? rows.filter((item) => !['COMPLETED','CANCELLED'].includes(String(item.status || '').toUpperCase())).length : 0;
      if (active > 0) link.textContent = `My Job Cards (${active})`;
    } catch (_) {}
  }

  function closeTechnicianSpareRequest() {
    document.getElementById("belmTechnicianSpareModal")?.remove();
  }

  function renderTechnicianSpareRequest(machines) {
    closeTechnicianSpareRequest();
    const modal = document.createElement("div");
    modal.id = "belmTechnicianSpareModal";
    modal.className = "belm-checked-report-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "belmTechnicianSpareTitle");
    modal.innerHTML = `<section class="belm-checked-report-card belm-technician-spare-card">
      <header class="belm-checked-report-head">
        <div>
          <p>BELM Technician · Inventory request</p>
          <h2 id="belmTechnicianSpareTitle">Add Spare</h2>
          <span>Send a zero-stock spare alert to Spare Parts Inventory.</span>
        </div>
        <button type="button" data-close-tech-spare aria-label="Close Add Spare">×</button>
      </header>
      <form class="belm-technician-spare-form">
        <div class="belm-technician-spare-grid">
          <label>
            <span>Machine</span>
            <select name="machineId" required>
              ${machines.map((machine) => {
                const machineName = [machine.brand, machine.model].filter(Boolean).join(" ") || machine.model || "Machine";
                const reference = machine.serialNumber || machine.serial_number || machine.regNumber || machine.reg_number || "No serial";
                return `<option value="${escapeHtml(machine.id)}">${escapeHtml(machineName)} · ${escapeHtml(reference)}</option>`;
              }).join("")}
            </select>
          </label>
          <label>
            <span>Machine type</span>
            <input name="machineType" type="text" readonly required />
          </label>
          <label>
            <span>Part number</span>
            <input name="partNumber" type="text" maxlength="100" placeholder="e.g. CAT-1R-1808" required />
          </label>
          <label class="full">
            <span>Description</span>
            <textarea name="description" rows="4" maxlength="500" placeholder="Describe the spare part and where it is required" required></textarea>
          </label>
        </div>
        <div class="belm-technician-spare-note">
          <strong>Inventory stock will start at 0.</strong>
          <span>Inventory staff will receive an alert to add the spare or mark it Purchase Required.</span>
        </div>
        <p class="belm-checklist-edit-error" role="alert" hidden></p>
        <p class="belm-technician-spare-success" role="status" hidden></p>
        <footer class="belm-checked-report-actions">
          <button type="button" data-close-tech-spare>Cancel</button>
          <button type="button" data-new-tech-spare hidden>New Request</button>
          <button type="submit" class="primary">Send to Spare Parts Inventory</button>
        </footer>
      </form>
      <section class="belm-technician-request-history" aria-labelledby="belmTechnicianRequestHistoryTitle">
        <div class="belm-technician-request-history-head">
          <div>
            <span>Submitted by this Technician</span>
            <h3 id="belmTechnicianRequestHistoryTitle">My Inventory Requests</h3>
          </div>
          <button type="button" data-refresh-tech-spares>Refresh</button>
        </div>
        <div class="belm-technician-request-list" data-tech-spare-list>
          <div class="belm-report-empty">Loading Inventory Requests…</div>
        </div>
      </section>
    </section>`;

    const form = modal.querySelector("form");
    const machineSelect = form.elements.machineId;
    const machineTypeInput = form.elements.machineType;
    const title = modal.querySelector("#belmTechnicianSpareTitle");
    const headerDescription = title.nextElementSibling;
    const submit = form.querySelector('button[type="submit"]');
    const newRequestButton = form.querySelector("[data-new-tech-spare]");
    const requestList = modal.querySelector("[data-tech-spare-list]");
    let editingRequestId = "";
    let loadedRequests = [];
    const syncMachineType = () => {
      const selected = machines.find((machine) => String(machine.id) === machineSelect.value);
      machineTypeInput.value = selected?.machineType || selected?.machine_type || "";
    };
    const resetRequestForm = () => {
      editingRequestId = "";
      form.reset();
      if (machines[0]) machineSelect.value = String(machines[0].id);
      syncMachineType();
      title.textContent = "Add Spare";
      headerDescription.textContent = "Send a zero-stock spare alert to Spare Parts Inventory.";
      submit.textContent = "Send to Spare Parts Inventory";
      newRequestButton.hidden = true;
      form.querySelector(".belm-checklist-edit-error").hidden = true;
    };
    const editRequest = (request) => {
      editingRequestId = String(request.id);
      machineSelect.value = String(request.machineId || "");
      syncMachineType();
      form.elements.partNumber.value = request.partNumber || "";
      form.elements.description.value = request.description || request.partName || "";
      title.textContent = "Re-edit Inventory Request";
      headerDescription.textContent = "Correct this pending request and send the updated information to Inventory.";
      submit.textContent = "Update Inventory Request";
      newRequestButton.hidden = false;
      form.querySelector(".belm-technician-spare-success").hidden = true;
      form.elements.partNumber.focus();
    };
    const renderRequests = (requests) => {
      loadedRequests = Array.isArray(requests) ? requests : [];
      requestList.innerHTML = loadedRequests.length ? loadedRequests.map((request) => {
        const status = String(request.status || "PENDING").toUpperCase();
        const machineName = [request.machineBrand, request.machineModel].filter(Boolean).join(" ")
          || request.machineModel
          || "Machine";
        return `<article class="belm-technician-request-item">
          <div class="belm-technician-request-copy">
            <strong>${escapeHtml(request.partNumber || "No part number")}</strong>
            <span>${escapeHtml(request.description || request.partName || "No description")}</span>
            <small>${escapeHtml(machineName)} · ${escapeHtml(request.machineType || "Machine type not recorded")} · ${escapeHtml(request.customerName || "")}</small>
            <time>${escapeHtml(request.createdAt ? new Date(request.createdAt).toLocaleString() : "Date not recorded")}</time>
          </div>
          <span class="belm-technician-request-status status-${escapeHtml(status.toLowerCase())}">${escapeHtml(status.replaceAll("_", " "))}</span>
          ${status === "PENDING"
            ? `<button type="button" data-reedit-tech-spare="${escapeHtml(request.id)}">Re-edit</button>`
            : '<span class="belm-technician-request-locked">Inventory action started · No edit</span>'}
        </article>`;
      }).join("") : '<div class="belm-report-empty">No Inventory Requests sent yet.</div>';
    };
    const loadRequests = async () => {
      const token = localStorage.getItem("belm_tech_token");
      if (!token) return;
      requestList.innerHTML = '<div class="belm-report-empty">Loading Inventory Requests…</div>';
      try {
        const response = await fetch("/api/spare-parts/requests", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const requests = await response.json().catch(() => []);
        if (!response.ok) throw new Error(requests.error || "Inventory Requests could not be loaded.");
        renderRequests(requests);
      } catch (error) {
        requestList.innerHTML = `<div class="belm-checklist-edit-error">${escapeHtml(error.message || "Inventory Requests could not be loaded.")}</div>`;
      }
    };
    syncMachineType();
    machineSelect.addEventListener("change", syncMachineType);
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-close-tech-spare]")) {
        closeTechnicianSpareRequest();
        return;
      }
      if (event.target.closest("[data-new-tech-spare]")) resetRequestForm();
      if (event.target.closest("[data-refresh-tech-spares]")) loadRequests();
      const editButton = event.target.closest("[data-reedit-tech-spare]");
      if (!editButton) return;
      const request = loadedRequests.find(item =>
        String(item.id) === String(editButton.dataset.reeditTechSpare)
      );
      if (request) editRequest(request);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const token = localStorage.getItem("belm_tech_token");
      if (!token) {
        window.location.href = "/tech";
        return;
      }
      const errorBox = form.querySelector(".belm-checklist-edit-error");
      const successBox = form.querySelector(".belm-technician-spare-success");
      submit.disabled = true;
      submit.textContent = editingRequestId ? "Updating…" : "Sending…";
      errorBox.hidden = true;
      successBox.hidden = true;
      try {
        const response = await fetch(
          editingRequestId
            ? `/api/spare-parts/requests/${encodeURIComponent(editingRequestId)}`
            : "/api/spare-parts/requests",
          {
          method: editingRequestId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: editingRequestId ? "edit" : undefined,
            machineId: machineSelect.value,
            machineType: machineTypeInput.value,
            partNumber: form.elements.partNumber.value.trim(),
            description: form.elements.description.value.trim(),
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Spare request could not be sent.");
        successBox.textContent = result.message || "Spare request sent to Inventory.";
        successBox.hidden = false;
        resetRequestForm();
        successBox.hidden = false;
        successBox.textContent = result.message || "Inventory Request saved.";
        await loadRequests();
        form.elements.partNumber.focus();
      } catch (error) {
        errorBox.textContent = error.message || "Spare request could not be sent.";
        errorBox.hidden = false;
      } finally {
        submit.disabled = false;
        submit.textContent = editingRequestId
          ? "Update Inventory Request"
          : "Send to Spare Parts Inventory";
      }
    });
    document.body.appendChild(modal);
    loadRequests();
    form.elements.partNumber.focus();
  }

  const SPARE_RECOMMENDATION_SYSTEMS = [
    ["ENGINE", "Engine"],
    ["TRANSMISSION", "Transmission / Gearbox"],
    ["BRAKE_SYSTEM", "Brake System"],
    ["HYDRAULIC_SYSTEM", "Hydraulic System"],
    ["ELECTRICAL_SYSTEM", "Electrical System"],
    ["OTHER", "Other"],
  ];

  const SERVICE_DAY_TYPES = [
    ["250_HOUR", "250-Hour Service"],
    ["500_HOUR", "500-Hour Service"],
    ["1000_HOUR", "1000-Hour Service"],
    ["2000_HOUR", "2000-Hour Service"],
  ];

  function injectServiceDayFields() {
    if (!window.location.pathname.startsWith("/tech")) return;
    if (document.getElementById("belmServiceDayBlock")) return;

    const label = Array.from(document.querySelectorAll("label"))
      .find(element => (element.textContent || "").trim().toLowerCase().startsWith("hour meter reading"));
    if (!label) return;
    const anchor = label.closest("label") || label;
    const host = anchor.parentElement;
    if (!host) return;

    // The machine being checked is known for certain from the moment the
    // Technician tapped into it (see technicianMachineInfoCard's capture
    // listener). Fall back to matching the page's visible heading text
    // only if that wasn't captured for some reason.
    (async () => {
      try {
        let matchedMachineId = null;
        try { matchedMachineId = sessionStorage.getItem("belm_current_checkup_machine_id"); } catch (_) {}

        if (!matchedMachineId) {
          const machines = await loadTechnicianReportMachines();
          const pageText = document.body.innerText || "";
          const match = (machines || []).find(machine => {
            const name = [machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType;
            return name && pageText.includes(name);
          });
          matchedMachineId = match?.id || null;
        }
        if (!matchedMachineId) return;

        const token = localStorage.getItem("belm_tech_token");
        const response = await fetch(`/api/checklist-reports?action=service-status&machineId=${encodeURIComponent(matchedMachineId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const status = await response.json();
        const hint = document.getElementById("belmLastHourMeterHint");
        const remaining = Math.round(status?.hoursRemaining ?? 0);
        const dueText = status?.level === "RED" ? " — Service due now" : status?.level === "YELLOW" ? " — Service due soon" : "";
        if (hint) {
          hint.textContent = `Last recorded: ${Number(status?.totalHours || 0).toLocaleString("en-TZ")} hrs — today's reading must be the same or higher.${dueText}`;
        }
        // Pre-select the matching Service Type (e.g. "500-Hour Service")
        // from the same NEXT SERVICE panel shown on the machine card —
        // the Technician shouldn't have to work out which interval is due
        // by hand when the system already knows.
        const intervalHours = Number(status?.intervalHours || 0);
        if (intervalHours > 0) {
          const serviceTypeSelect = document.getElementById("belmServiceType");
          const matchingValue = `${intervalHours}_HOUR`;
          if (serviceTypeSelect && [...serviceTypeSelect.options].some(option => option.value === matchingValue)) {
            serviceTypeSelect.value = matchingValue;
          }
          // If service is due now or soon, default "Is this a service day?"
          // to checked — the Technician can still uncheck it if this visit
          // is just a routine check-up, not the actual service.
          if (["RED", "YELLOW"].includes(status?.level) && !document.getElementById("belmIsServiceDay").checked) {
            document.getElementById("belmIsServiceDay").checked = true;
            document.getElementById("belmServiceDayFields").classList.remove("hidden");
          }
        }
      } catch (_) { /* purely a helper hint — safe to skip on any failure */ }
    })();

    const block = document.createElement("div");
    block.id = "belmServiceDayBlock";
    block.className = "belm-service-day-block";
    block.innerHTML = `
      <p id="belmLastHourMeterHint" class="belm-last-hour-meter-hint">Loading last recorded hours…</p>
      <label class="belm-service-day-toggle">
        <input type="checkbox" id="belmIsServiceDay">
        Is this a service day?
      </label>
      <div id="belmServiceDayFields" class="belm-service-day-fields hidden">
        <label>Service date<input type="date" id="belmServiceDate"></label>
        <label>Service type
          <select id="belmServiceType">
            <option value="">Select service type</option>
            ${SERVICE_DAY_TYPES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
          </select>
        </label>
      </div>
      <label class="belm-display-photo-field">Display photo <span style="color:#ff8a80;font-weight:900">*</span> <small>(REQUIRED every check-up — photo of the machine's display screen showing fuel level, fault codes, etc.)</small>
        <input type="file" id="belmDisplayPhotoFile" accept="image/*" capture="environment">
        <img id="belmDisplayPhotoPreview" class="belm-display-photo-preview hidden" alt="Display photo preview">
      </label>`;
    anchor.insertAdjacentElement("afterend", block);

    document.getElementById("belmServiceDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("belmServiceDate").max = new Date().toISOString().slice(0, 10);
    document.getElementById("belmIsServiceDay").addEventListener("change", (event) => {
      document.getElementById("belmServiceDayFields").classList.toggle("hidden", !event.target.checked);
    });
    document.getElementById("belmDisplayPhotoFile").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressPhotoToDataUrl(file);
        block.dataset.displayPhoto = dataUrl;
        const preview = document.getElementById("belmDisplayPhotoPreview");
        preview.src = dataUrl;
        preview.classList.remove("hidden");
      } catch (error) {
        alert(error.message || "Could not prepare that photo.");
        event.target.value = "";
      }
    });
  }

  // Compresses an image file to a small JPEG data URL — shared logic so the
  // "Display photo" field stays lightweight like every other checklist
  // photo capture in this app, regardless of the source camera's resolution.
  function compressPhotoToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file || !String(file.type || "").startsWith("image/")) {
        reject(new Error("Select an image file."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that photo."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Could not read that photo."));
        image.onload = () => {
          const canvas = document.createElement("canvas");
          const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
          const scale = Math.min(1, 1280 / Math.max(1, longestSide));
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.68));
        };
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  function installServiceDayInjector() {
    if (!window.location.pathname.startsWith("/tech")) return;
    if (document.documentElement.dataset.belmServiceDaySync === "ready") return;
    const Xhr = window.XMLHttpRequest;
    if (!Xhr?.prototype?.send) return;
    document.documentElement.dataset.belmServiceDaySync = "ready";

    const previousSend = Xhr.prototype.send;
    Xhr.prototype.send = function (body) {
      if (this.belmChecklistSaveRequest) {
        const isServiceDay = document.getElementById("belmIsServiceDay")?.checked || false;
        const displayPhoto = document.getElementById("belmServiceDayBlock")?.dataset.displayPhoto || "";
        try {
          const request = typeof body === "string" ? JSON.parse(body) : {};
          request.isServiceDay = isServiceDay;
          if (isServiceDay) {
            request.serviceDate = document.getElementById("belmServiceDate")?.value || "";
            request.serviceType = document.getElementById("belmServiceType")?.value || "";
          }
          if (displayPhoto) request.displayPhotoUrl = displayPhoto;
          body = JSON.stringify(request);
        } catch (_) {}
      }
      return previousSend.call(this, body);
    };
  }

  function closeTechnicianSpareRecommendation() {
    document.getElementById("belmSpareRecommendationModal")?.remove();
  }

  function renderTechnicianSpareRecommendation(machines, selfServiceMode = false) {
    closeTechnicianSpareRecommendation();
    const modal = document.createElement("div");
    modal.id = "belmSpareRecommendationModal";
    modal.className = "belm-checked-report-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "belmSpareRecommendationTitle");
    modal.innerHTML = `<section class="belm-checked-report-card belm-technician-spare-card">
      <header class="belm-checked-report-head">
        <div>
          <p>${selfServiceMode ? "Customer Technician · Internal recommendation" : "BELM Technician · Customer spare recommendation"}</p>
          <h2 id="belmSpareRecommendationTitle">Recommend Spare to Customer</h2>
          <span>${selfServiceMode ? "Recommend the spare internally. BELM Inventory stays private; the customer can request BELM support if needed." : "The customer will see only the reference number and can press Service Requirements to order it."}</span>
        </div>
        <button type="button" data-close-spare-recommendation aria-label="Close">×</button>
      </header>
      <form class="belm-technician-spare-form">
        <div class="belm-technician-spare-grid">
          <label>
            <span>Machine</span>
            <select name="machineId" required>
              ${machines.map((machine) => {
                const machineName = [machine.brand, machine.model].filter(Boolean).join(" ") || machine.model || "Machine";
                const reference = machine.serialNumber || machine.serial_number || machine.regNumber || machine.reg_number || "No serial";
                return `<option value="${escapeHtml(machine.id)}">${escapeHtml(machineName)} · ${escapeHtml(reference)}</option>`;
              }).join("")}
            </select>
          </label>
          <label>
            <span>System</span>
            <select name="systemCategory" required>
              ${SPARE_RECOMMENDATION_SYSTEMS.map(([value, label]) =>
                `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("")}
            </select>
          </label>
          ${selfServiceMode ? "" : `<label class="full">
            <span>Pick from Spare Parts Inventory <small>(auto-fills the fields below — optional)</small></span>
            <select id="belmSpareCatalogPick"><option value="">— Custom item (not in inventory) —</option></select>
          </label>`}
          <label>
            <span>Spare name</span>
            <input name="spareName" type="text" maxlength="255" placeholder="e.g. Hydraulic return filter" required />
          </label>
          <label>
            <span>Reference number</span>
            <input name="referenceNumber" type="text" maxlength="100" placeholder="e.g. BELM-HF-2201" required />
          </label>
          <label class="full">
            <span>Manufacturer part number</span>
            <input name="manufacturerPartNumber" type="text" maxlength="100" placeholder="e.g. 923855.0996" />
          </label>
        </div>
        <p class="belm-checklist-edit-error" role="alert" hidden></p>
        <p class="belm-technician-spare-success" role="status" hidden></p>
        <footer class="belm-checked-report-actions">
          <button type="button" data-close-spare-recommendation>Cancel</button>
          <button type="submit" class="primary">Send Recommendation to Customer</button>
        </footer>
      </form>
    </section>`;

    (async () => {
      const select = document.getElementById("belmSpareCatalogPick");
      if (!select) return;
      try {
        const token = localStorage.getItem("belm_tech_token");
        const response = await fetch("/api/spare-recommendations?action=catalog", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const catalog = response.ok ? await response.json() : [];
        select.innerHTML = '<option value="">— Custom item (not in inventory) —</option>'
          + catalog.map((part) =>
            `<option value="${escapeHtml(part.id)}" data-name-value="${escapeHtml(part.name || "")}" data-reference-value="${escapeHtml(part.referenceNumber || part.partNumber || "")}" data-part-number-value="${escapeHtml(part.partNumber || "")}">${escapeHtml(part.name)}${part.partNumber ? ` (${escapeHtml(part.partNumber)})` : ""}</option>`
          ).join("");
        select.addEventListener("change", () => {
          const option = select.selectedOptions[0];
          if (!option || !option.value) return;
          const form = select.closest("form");
          if (form.elements.spareName) form.elements.spareName.value = option.dataset.nameValue || "";
          if (form.elements.referenceNumber) form.elements.referenceNumber.value = option.dataset.referenceValue || "";
          if (form.elements.manufacturerPartNumber) form.elements.manufacturerPartNumber.value = option.dataset.partNumberValue || "";
        });
      } catch (_) { /* the picker is just a convenience — safe to skip on failure */ }
    })();

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-close-spare-recommendation]")) {
        closeTechnicianSpareRecommendation();
      }
    });
    modal.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('button[type="submit"]');
      const errorBox = form.querySelector(".belm-checklist-edit-error");
      const successBox = form.querySelector(".belm-technician-spare-success");
      const token = localStorage.getItem("belm_tech_token");
      if (!token) {
        window.location.href = "/tech";
        return;
      }
      submit.disabled = true;
      submit.textContent = "Sending…";
      errorBox.hidden = true;
      try {
        const response = await fetch("/api/spare-recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            machineId: form.elements.machineId.value,
            systemCategory: form.elements.systemCategory.value,
            spareName: form.elements.spareName.value.trim(),
            referenceNumber: form.elements.referenceNumber.value.trim(),
            manufacturerPartNumber: form.elements.manufacturerPartNumber.value.trim(),
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Recommendation could not be sent.");
        successBox.textContent = result.message || "Recommendation sent to the customer.";
        successBox.hidden = false;
        form.reset();
      } catch (error) {
        errorBox.textContent = error.message || "Recommendation could not be sent.";
        errorBox.hidden = false;
      } finally {
        submit.disabled = false;
        submit.textContent = "Send Recommendation to Customer";
      }
    });
    document.body.appendChild(modal);
    modal.querySelector('[name="spareName"]')?.focus();
  }

  async function addTechnicianSpareRecommendationShortcut() {
    if (window.location.pathname !== "/tech") return;
    if (document.getElementById("belm-tech-spare-recommend-shortcut")) return;
    const payload = tokenPayload("belm_tech_token");
    const token = localStorage.getItem("belm_tech_token");
    if (!payload || !token || String(payload.roleName || "").toLowerCase() !== "technician") return;

    const button = document.createElement("button");
    button.id = "belm-tech-spare-recommend-shortcut";
    button.type = "button";
    button.className = "belm-tech-spare-recommend-shortcut";
    button.textContent = "+ Recommend Spare";
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Loading…";
      try {
        const customer = await loadTechnicianCustomerProfile();
        const machines = Array.isArray(customer?.machines) ? customer.machines : await loadTechnicianReportMachines();
        if (!machines.length) throw new Error("No assigned machine is available for this Technician.");
        renderTechnicianSpareRecommendation(machines, Boolean(customer?.isMachineryAdmin && payload?.isCustomerManaged));
      } catch (error) {
        alert(error.message || "Could not open Recommend Spare.");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
    document.body.appendChild(button);
  }

  async function addTechnicianSpareShortcut() {
    if (window.location.pathname !== "/tech") return;
    if (document.getElementById("belm-tech-spare-shortcut")) return;
    const payload = tokenPayload("belm_tech_token");
    const token = localStorage.getItem("belm_tech_token");
    if (!payload || !token || String(payload.roleName || "").toLowerCase() !== "technician") return;
    const assignedCustomer = await loadTechnicianCustomerProfile();
    if (assignedCustomer?.isMachineryAdmin && payload?.isCustomerManaged) return;

    const button = document.createElement("button");
    button.id = "belm-tech-spare-shortcut";
    button.type = "button";
    button.className = "belm-tech-spare-shortcut";
    button.textContent = "+ Add Spare";
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Loading…";
      try {
        const machines = await loadTechnicianReportMachines();
        if (!machines.length) throw new Error("No assigned machine is available for this Technician.");
        renderTechnicianSpareRequest(machines);
      } catch (error) {
        alert(error.message || "Could not open Add Spare.");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
    document.body.appendChild(button);
  }

  if (redirectIfAlreadyLoggedIn()) return;
  if (enforceUnifiedTechnicianLogin()) return;
  if (handoffTechnicianSession()) return;

  installCheckedReportViewer();
  installAuthenticatedReportDownloads();
  installTechnicianSavedReportViewer();
  installServiceDayInjector();
  if (window.BELMTheme) window.BELMTheme.refresh();
  refreshShortcut();
  addTechnicianTasksShortcut();
  addTechnicianJobCardsShortcut();
  addTechnicianSpareShortcut();
  addTechnicianSpareRecommendationShortcut();
  addTechnicianCustomerDashboardShortcut();
  syncTechnicianCustomerName();
  clarifyTechnicianAssignment();
  clarifyTechnicianChecklistSave();
  enhanceCustomerLogin();
  addForgotPasswordLink();
  addPortalHomeLink();
  enforceAdminPageAccess();
  enhanceCustomerAssistants();
  enhanceCustomerMachineExpenseCards();
  enforceOperatorCardOnlyInterface();
  enhanceCustomerDirectMessagesPanel();
  enhanceCustomerAnnouncementsPanel();
  enhanceCustomerProformasPanel();
  wireEmailReportButtons();
  wireProblemReportButtons();
  wireOperatorReportsButtons();
  enhanceServiceRequestHistory();
  addCustomerNameToMachinesHeading();
  replaceGenericCustomerLabels();
  insertCustomerActivityOverview();
  insertCustomerLangToggle();
  refreshBelmUpdatesBlink();
  enhanceTechnicianReportCards();
  redirectChecklistManager();
  redirectServiceRequestManager();
  redirectBillingManager();
  redirectCustomersManager();
  redirectSparePartsManager();
  redirectRolesManager();
  redirectSuppliersManager();
  redirectOverviewManager();
  redirectReportsManager();
  redirectSettingsManager();
  removeLegacyOwnerRole();
  improvePhotoInputs();
  injectServiceDayFields();
  enforceViewerInterface();
  correctLegacyCopy();
  enhanceCheckedReportButtons();
  setInterval(() => {
    refreshShortcut();
    addTechnicianTasksShortcut();
    addTechnicianJobCardsShortcut();
    addTechnicianSpareShortcut();
    addTechnicianSpareRecommendationShortcut();
    addTechnicianCustomerDashboardShortcut();
    syncTechnicianCustomerName();
    clarifyTechnicianAssignment();
    clarifyTechnicianChecklistSave();
    enhanceCustomerLogin();
    addForgotPasswordLink();
    addPortalHomeLink();
    enforceAdminPageAccess();
    enhanceCustomerAssistants();
    enhanceCustomerMachineExpenseCards();
    enforceOperatorCardOnlyInterface();
    enhanceCustomerDirectMessagesPanel();
    enhanceCustomerAnnouncementsPanel();
    enhanceCustomerProformasPanel();
    wireEmailReportButtons();
  wireProblemReportButtons();
  wireOperatorReportsButtons();
  enhanceServiceRequestHistory();
  addCustomerNameToMachinesHeading();
  replaceGenericCustomerLabels();
  insertCustomerActivityOverview();
  insertCustomerLangToggle();
  refreshBelmUpdatesBlink();
    enhanceTechnicianReportCards();
    redirectChecklistManager();
    redirectServiceRequestManager();
    redirectBillingManager();
    redirectCustomersManager();
    redirectSparePartsManager();
    redirectRolesManager();
    redirectSuppliersManager();
    redirectOverviewManager();
    redirectReportsManager();
    redirectSettingsManager();
    removeLegacyOwnerRole();
    improvePhotoInputs();
    injectServiceDayFields();
    enforceViewerInterface();
    correctLegacyCopy();
    enhanceCheckedReportButtons();
    installStaleTechSessionDetector();
    watchForStuckTechLoading();
    if (window.BELMTheme) window.BELMTheme.refresh();
    installTechChecklistSubmitInterceptor();
    hideCheckedMachinesFromTechList();
  }, 1500);
})();
