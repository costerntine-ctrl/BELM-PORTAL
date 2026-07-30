(function () {
  if (window.belmConfirmDelete) return; // already loaded on this page

  function ensureDialog() {
    let dialog = document.getElementById("belmDeleteConfirmDialog");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.id = "belmDeleteConfirmDialog";
    dialog.innerHTML = `
      <form class="belm-delete-confirm-card" method="dialog">
        <div class="belm-delete-confirm-head">
          <div>
            <p class="belm-delete-confirm-eyebrow">CONFIRM DELETION</p>
            <h2 id="belmDeleteConfirmTitle">Delete this record?</h2>
          </div>
          <button type="button" class="belm-delete-confirm-close" aria-label="Close">×</button>
        </div>
        <p id="belmDeleteConfirmMessage" class="belm-delete-confirm-message"></p>
        <p class="belm-delete-confirm-error" id="belmDeleteConfirmError" hidden></p>
        <label>Delete PIN
          <input id="belmDeleteConfirmPin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required>
        </label>
        <label>Your admin password
          <input id="belmDeleteConfirmPassword" type="password" required autocomplete="current-password">
        </label>
        <label>Reason for deletion
          <textarea id="belmDeleteConfirmReason" rows="2" maxlength="500" required placeholder="e.g. Duplicate record, customer requested removal, entered by mistake…"></textarea>
        </label>
        <div class="belm-delete-confirm-actions">
          <button type="button" class="belm-delete-confirm-cancel">Cancel</button>
          <button type="button" class="belm-delete-confirm-submit">Confirm delete</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function injectStyles() {
    if (document.getElementById("belmDeleteConfirmStyles")) return;
    const style = document.createElement("style");
    style.id = "belmDeleteConfirmStyles";
    style.textContent = `
      #belmDeleteConfirmDialog { width: min(440px, 92vw); padding: 0; border: 0; border-radius: 16px; box-shadow: 0 30px 80px rgba(7,14,28,.35); }
      #belmDeleteConfirmDialog::backdrop { background: rgba(12,18,31,.72); backdrop-filter: blur(3px); }
      .belm-delete-confirm-card { display: grid; gap: 12px; padding: 22px; font-family: Inter, system-ui, sans-serif; }
      .belm-delete-confirm-head { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
      .belm-delete-confirm-eyebrow { margin: 0 0 3px; color: #a4231b; font-size: 10px; font-weight: 900; letter-spacing: .08em; }
      .belm-delete-confirm-head h2 { margin: 0; font-size: 19px; color: #1e293b; }
      .belm-delete-confirm-close { padding: 0; border: 0; background: transparent; font-size: 24px; color: #64748b; cursor: pointer; }
      .belm-delete-confirm-message { margin: 0; color: #475569; font-size: 13px; }
      .belm-delete-confirm-error { margin: 0; padding: 8px 10px; border-radius: 8px; background: #fdecec; color: #a4231b; font-size: 12px; font-weight: 700; }
      #belmDeleteConfirmDialog label { display: grid; gap: 5px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: .03em; }
      #belmDeleteConfirmDialog input, #belmDeleteConfirmDialog textarea { padding: 9px 11px; border: 1px solid #dbe4ee; border-radius: 8px; font-size: 14px; font-family: inherit; color: #1e293b; }
      .belm-delete-confirm-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 6px; padding-top: 14px; border-top: 1px solid #e5eaf0; }
      .belm-delete-confirm-actions button { padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 800; cursor: pointer; }
      .belm-delete-confirm-cancel { border: 1px solid #dbe4ee; background: #fff; color: #475569; }
      .belm-delete-confirm-submit { border: 1px solid #a4231b; background: #d92d20; color: #fff; }
      .belm-delete-confirm-submit:disabled { opacity: .6; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }

  // Returns a Promise resolving to { pin, adminPassword, reason } if confirmed,
  // or null if the user cancels.
  window.belmConfirmDelete = function (options = {}) {
    injectStyles();
    const dialog = ensureDialog();
    document.getElementById("belmDeleteConfirmTitle").textContent = options.title || "Delete this record?";
    document.getElementById("belmDeleteConfirmMessage").textContent =
      options.message || "This action cannot be undone without admin recovery. Confirm to continue.";
    document.getElementById("belmDeleteConfirmPin").value = "";
    document.getElementById("belmDeleteConfirmPassword").value = "";
    document.getElementById("belmDeleteConfirmReason").value = "";
    document.getElementById("belmDeleteConfirmError").hidden = true;
    dialog.showModal();

    return new Promise((resolve) => {
      function cleanup() {
        dialog.close();
        submitButton.removeEventListener("click", onSubmit);
        cancelButton.removeEventListener("click", onCancel);
        closeButton.removeEventListener("click", onCancel);
      }
      function onCancel() {
        cleanup();
        resolve(null);
      }
      function onSubmit() {
        const pin = document.getElementById("belmDeleteConfirmPin").value.trim();
        const adminPassword = document.getElementById("belmDeleteConfirmPassword").value;
        const reason = document.getElementById("belmDeleteConfirmReason").value.trim();
        const errorBox = document.getElementById("belmDeleteConfirmError");
        if (!pin || !adminPassword || !reason) {
          errorBox.textContent = "Fill in the PIN, your password, and a reason before confirming.";
          errorBox.hidden = false;
          return;
        }
        cleanup();
        resolve({ pin, adminPassword, reason });
      }
      const submitButton = dialog.querySelector(".belm-delete-confirm-submit");
      const cancelButton = dialog.querySelector(".belm-delete-confirm-cancel");
      const closeButton = dialog.querySelector(".belm-delete-confirm-close");
      submitButton.addEventListener("click", onSubmit);
      cancelButton.addEventListener("click", onCancel);
      closeButton.addEventListener("click", onCancel);
    });
  };
})();
