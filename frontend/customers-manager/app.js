// BELM Customer Overview runtime entrypoint.
// V726 regression repair: the sidebar-cleanup commit removed several dialogs
// that manager.js still binds to at startup. That caused a browser-side JS
// exception before /api/customers was requested, making every customer appear
// to be gone even though the database records were still present.
(function bootstrapBelmCustomerOverview() {
  if (window.__belmCustomerOverviewRuntimeLoading) return;
  window.__belmCustomerOverviewRuntimeLoading = true;

  function addCredentialAction(id, html) {
    if (document.getElementById(id)) return;
    const actions = document.querySelector("#credentialsDialog .dialog-actions");
    if (!actions) return;
    actions.insertAdjacentHTML("beforeend", html);
  }

  // manager.js still uses these controls for the customer login workflow.
  addCredentialAction("copyCredentialLinkButton", '<button id="copyCredentialLinkButton" class="secondary" type="button">Copy link</button>');
  addCredentialAction("copyCredentialPasswordButton", '<button id="copyCredentialPasswordButton" class="secondary" type="button">Copy password</button>');
  addCredentialAction("openCredentialLink", '<a id="openCredentialLink" class="primary" target="_blank" rel="noopener">Open customer link</a>');

  function addDialog(id, html) {
    if (document.getElementById(id)) return;
    document.body.insertAdjacentHTML("beforeend", html);
  }

  addDialog("customerMessagesDialog", `
    <dialog id="customerMessagesDialog">
      <div class="dialog-card">
        <div class="dialog-head">
          <div><p class="eyebrow">Customer Fleet</p><h2 id="customerMessagesTitle">Customer Messages</h2></div>
          <button class="icon-close" data-close="customerMessagesDialog" type="button" aria-label="Close">×</button>
        </div>
        <div id="customerMessagesBody"></div>
      </div>
    </dialog>`);

  addDialog("sendCustomerMessageDialog", `
    <dialog id="sendCustomerMessageDialog">
      <form id="sendCustomerMessageForm" class="dialog-card">
        <div class="dialog-head">
          <div><p class="eyebrow">BELM → Customer</p><h2 id="sendCustomerMessageTitle">Message Customer</h2></div>
          <button class="icon-close" data-close="sendCustomerMessageDialog" type="button" aria-label="Close">×</button>
        </div>
        <input id="sendCustomerMessageCustomerId" type="hidden">
        <div class="form-grid">
          <label>Related machine <small>(optional)</small>
            <select id="sendCustomerMessageMachine"><option value="">General / customer account</option></select>
          </label>
          <label>Subject
            <input id="sendCustomerMessageSubject" maxlength="160" value="Message from BELM" required>
          </label>
          <div class="message-checkup-jump">
            <button type="button" id="sendCustomerMessageCheckup" class="ghost" disabled>Check Up → Fill checklist</button>
          </div>
          <label class="span-2">Message
            <textarea id="sendCustomerMessageBody" rows="6" maxlength="2000" placeholder="Write the message the customer should see in the portal…" required></textarea>
          </label>
          <label class="span-2 message-email-option">
            <input id="sendCustomerMessageEmailGroup" type="checkbox">
            <span><strong>Send Email to Customer Group for Action</strong><small>Customer account owner + all active customer users.</small></span>
          </label>
        </div>
        <p class="muted">Every message is saved in Communication History. Email is optional here; only Service Overdue alerts are emailed automatically to the customer group.</p>
        <div class="dialog-actions">
          <button class="ghost" data-close="sendCustomerMessageDialog" type="button">Cancel</button>
          <button id="sendCustomerMessageButton" class="primary" type="submit">Save / Send Message</button>
        </div>
      </form>
    </dialog>`);

  addDialog("machineListDialog", `
    <dialog id="machineListDialog">
      <div class="dialog-card">
        <div class="dialog-head">
          <div><p class="eyebrow">Customer Fleet</p><h2 id="machineListTitle">Machines</h2></div>
          <button class="icon-close" data-close="machineListDialog" type="button" aria-label="Close">×</button>
        </div>
        <div class="dialog-actions" style="justify-content:flex-start;border-top:0;padding-top:0;margin-bottom:12px;">
          <button id="machineListAddButton" class="primary" type="button">+ Add machine</button>
        </div>
        <div id="machineListBody"></div>
      </div>
    </dialog>`);

  addDialog("reportsDialog", `
    <dialog id="reportsDialog">
      <div class="dialog-card report-center-dialog-card">
        <div class="dialog-head">
          <div><p class="eyebrow">Machine Report Center</p><h2 id="reportsDialogTitle">Reports</h2></div>
          <button class="icon-close" data-close="reportsDialog" type="button" aria-label="Close">×</button>
        </div>
        <nav class="machine-report-tabs" aria-label="Report type">
          <button type="button" class="active" data-report-tab="checklist">Checklist Report</button>
          <button type="button" data-report-tab="jobcard">Job Card Report</button>
          <button type="button" data-report-tab="daily">Daily Report</button>
          <button type="button" data-report-tab="operator">Operator Reported</button>
          <button type="button" data-report-tab="analysis">Machine Analysis</button>
        </nav>
        <div class="machine-report-filter">
          <label>Filter
            <select id="machineReportFilterMode">
              <option value="all">All time</option>
              <option value="day">Date</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </label>
          <label id="machineReportDayField" class="hidden">Date<input id="machineReportDay" type="date"></label>
          <label id="machineReportMonthField" class="hidden">Month<input id="machineReportMonth" type="month"></label>
          <label id="machineReportYearField" class="hidden">Year<input id="machineReportYear" type="number" min="2000" max="2100" step="1" placeholder="2026"></label>
          <button id="machineReportApplyFilter" type="button">View Reports</button>
          <button id="machineReportDownloadButton" class="primary" type="button">Download Report</button>
        </div>
        <p id="machineReportPeriodLabel" class="machine-report-period-label">Showing all saved reports.</p>
        <div id="reportsList" class="reports-list report-center-list"></div>
      </div>
    </dialog>`);

  addDialog("expenseReceiptsDialog", `
    <dialog id="expenseReceiptsDialog">
      <div class="dialog-card">
        <div class="dialog-head">
          <div><p class="eyebrow">Bookkeeping</p><h2 id="expenseReceiptsTitle">Procurement receipts</h2></div>
          <div class="dialog-head-actions">
            <button class="ghost" id="downloadAllExpenseReceiptsButton" type="button">Download All</button>
            <button class="icon-close" data-close="expenseReceiptsDialog" type="button" aria-label="Close">×</button>
          </div>
        </div>
        <div id="expenseReceiptsBody" class="dialog-body"></div>
      </div>
    </dialog>`);

  addDialog("reportViewDialog", `
    <dialog id="reportViewDialog">
      <div class="dialog-card">
        <div class="dialog-head">
          <div><p class="eyebrow" id="reportViewEyebrow">Checked Report</p><h2 id="reportViewTitle">Report detail</h2></div>
          <div class="dialog-head-actions">
            <button id="reportViewPrintButton" type="button" class="ghost">Print</button>
            <a id="reportViewDownloadLink" href="#" target="_blank" rel="noopener">Download PDF</a>
            <button class="icon-close" data-close="reportViewDialog" type="button" aria-label="Close">×</button>
          </div>
        </div>
        <div id="reportViewBody" class="report-view-body"></div>
      </div>
    </dialog>`);

  addDialog("checkupDialog", `
    <dialog id="checkupDialog">
      <form id="checkupForm" class="dialog-card">
        <div class="dialog-head">
          <div><p class="eyebrow">Machine Check-up</p><h2 id="checkupDialogTitle">Check-up</h2></div>
          <button class="icon-close" data-close="checkupDialog" type="button" aria-label="Close">×</button>
        </div>
        <input id="checkupMachineId" type="hidden">
        <div id="checkupFormAlert" class="alert error hidden"></div>
        <label>Checklist template<select id="checkupTemplate"></select></label>
        <label>Running HRS <small id="checkupLastHourMeter">(loading last recorded hours…)</small><input id="checkupHourMeter" type="number" min="0" step="0.1" required placeholder="Enter today's hour meter reading"></label>
        <label>Technician / Inspector <small>(automatic from login)</small><input id="checkupFilledBy" type="text" placeholder="Automatic from login" readonly></label>
        <label class="toggle-row"><input id="checkupIsServiceDay" type="checkbox"> Is this a service day?</label>
        <div id="checkupServiceFields" class="two-column hidden">
          <label>Service date<input id="checkupServiceDate" type="date"></label>
          <label>Service type
            <select id="checkupServiceType">
              <option value="">Select service type</option>
              <option value="250_HOUR">250-Hour Service</option>
              <option value="500_HOUR">500-Hour Service</option>
              <option value="1000_HOUR">1000-Hour Service</option>
              <option value="2000_HOUR">2000-Hour Service</option>
            </select>
          </label>
        </div>
        <label>Display photo <span class="required-mark">*</span> <small>(REQUIRED every check-up — photo of the machine's display screen showing fuel level, fault codes, etc.)</small>
          <div class="checkup-photo-uploader">
            <input id="checkupDisplayPhotoFile" type="file" accept="image/*" capture="environment" class="checkup-photo-picker">
            <img id="checkupDisplayPhotoPreview" class="checkup-photo-preview hidden" alt="Display photo preview">
            <input id="checkupDisplayPhotoValue" type="hidden">
          </div>
        </label>
        <div id="checkupItems" class="checkup-items"></div>
        <div class="dialog-actions">
          <button class="ghost" data-close="checkupDialog" type="button">Cancel</button>
          <button id="saveCheckupButton" class="primary" type="submit">Save check-up</button>
        </div>
      </form>
    </dialog>`);

  function showBootstrapError(message) {
    const grid = document.getElementById("customerGrid");
    if (grid) {
      grid.innerHTML = `<div class="empty"><strong>Customer dashboards could not start.</strong><br>${message}</div>`;
    }
  }

  function loadScript(src, done) {
    const existing = document.querySelector(`script[data-belm-runtime-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") done();
      else existing.addEventListener("load", done, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.belmRuntimeSrc = src;
    script.addEventListener("load", function () {
      script.dataset.loaded = "1";
      done();
    }, { once: true });
    script.addEventListener("error", function () {
      window.__belmCustomerOverviewRuntimeLoading = false;
      showBootstrapError("A required Customer Overview runtime file failed to load. Please refresh the page.");
    }, { once: true });
    document.body.appendChild(script);
  }

  loadScript("/delete-confirm.js?v=726-customer-overview-repair", function () {
    loadScript("/edit-confirm.js?v=726-customer-overview-repair", function () {
      loadScript("/customers-manager/manager.js?v=726-customer-overview-repair", function () {
        loadScript("/customers-manager/report-result-enhancer.js?v=728-context-results", function () {
          window.__belmCustomerOverviewRuntimeReady = true;
        });
      });
    });
  });
})();
