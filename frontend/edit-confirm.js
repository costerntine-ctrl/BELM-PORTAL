(function () {
  if (window.belmConfirmEdit) return; // already loaded on this page

  function ensureDialog() {
    let dialog = document.getElementById("belmEditConfirmDialog");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.id = "belmEditConfirmDialog";
    dialog.innerHTML = `
      <form class="belm-edit-confirm-card" method="dialog">
        <div class="belm-edit-confirm-head">
          <div>
            <p class="belm-edit-confirm-eyebrow">CONFIRM CHANGES</p>
            <h2 id="belmEditConfirmTitle">Save changes?</h2>
          </div>
          <button type="button" class="belm-edit-confirm-close" aria-label="Close">×</button>
        </div>
        <p id="belmEditConfirmMessage" class="belm-edit-confirm-message"></p>
        <p class="belm-edit-confirm-error" id="belmEditConfirmError" hidden></p>
        <label>Edit PIN
          <input id="belmEditConfirmPin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required>
        </label>
        <div class="belm-edit-confirm-actions">
          <button type="button" class="belm-edit-confirm-cancel">Cancel</button>
          <button type="button" class="belm-edit-confirm-submit">Save changes</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function injectStyles() {
    if (document.getElementById("belmEditConfirmStyles")) return;
    const style = document.createElement("style");
    style.id = "belmEditConfirmStyles";
    style.textContent = `
      #belmEditConfirmDialog { width: min(400px, 92vw); padding: 0; border: 0; border-radius: 16px; box-shadow: 0 30px 80px rgba(7,14,28,.35); }
      #belmEditConfirmDialog::backdrop { background: rgba(12,18,31,.72); backdrop-filter: blur(3px); }
      .belm-edit-confirm-card { display: grid; gap: 12px; padding: 22px; font-family: Inter, system-ui, sans-serif; }
      .belm-edit-confirm-head { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
      .belm-edit-confirm-eyebrow { margin: 0 0 3px; color: #007c3d; font-size: 10px; font-weight: 900; letter-spacing: .08em; }
      .belm-edit-confirm-head h2 { margin: 0; font-size: 19px; color: #1e293b; }
      .belm-edit-confirm-close { padding: 0; border: 0; background: transparent; font-size: 24px; color: #64748b; cursor: pointer; }
      .belm-edit-confirm-message { margin: 0; color: #475569; font-size: 13px; }
      .belm-edit-confirm-error { margin: 0; padding: 8px 10px; border-radius: 8px; background: #fdecec; color: #a4231b; font-size: 12px; font-weight: 700; }
      #belmEditConfirmDialog label { display: grid; gap: 5px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: .03em; }
      #belmEditConfirmDialog input { padding: 9px 11px; border: 1px solid #dbe4ee; border-radius: 8px; font-size: 14px; font-family: inherit; color: #1e293b; }
      .belm-edit-confirm-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 6px; padding-top: 14px; border-top: 1px solid #e5eaf0; }
      .belm-edit-confirm-actions button { padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 800; cursor: pointer; }
      .belm-edit-confirm-cancel { border: 1px solid #dbe4ee; background: #fff; color: #475569; }
      .belm-edit-confirm-submit { border: 1px solid #007c3d; background: #00a651; color: #fff; }
      .belm-edit-confirm-submit:disabled { opacity: .6; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }

  // Returns a Promise resolving to { editPin } if confirmed, or null if cancelled.
  window.belmConfirmEdit = function (options = {}) {
    injectStyles();
    const dialog = ensureDialog();
    document.getElementById("belmEditConfirmTitle").textContent = options.title || "Save changes?";
    document.getElementById("belmEditConfirmMessage").textContent =
      options.message || "Enter the edit PIN to confirm these changes.";
    document.getElementById("belmEditConfirmPin").value = "";
    document.getElementById("belmEditConfirmError").hidden = true;
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
        const editPin = document.getElementById("belmEditConfirmPin").value.trim();
        const errorBox = document.getElementById("belmEditConfirmError");
        if (!editPin) {
          errorBox.textContent = "Enter the edit PIN.";
          errorBox.hidden = false;
          return;
        }
        cleanup();
        resolve({ editPin });
      }
      const submitButton = dialog.querySelector(".belm-edit-confirm-submit");
      const cancelButton = dialog.querySelector(".belm-edit-confirm-cancel");
      const closeButton = dialog.querySelector(".belm-edit-confirm-close");
      submitButton.addEventListener("click", onSubmit);
      cancelButton.addEventListener("click", onCancel);
      closeButton.addEventListener("click", onCancel);
    });
  };
})();
