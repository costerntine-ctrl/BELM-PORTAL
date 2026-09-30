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
        <label id="belmEditConfirmPinWrap">Edit PIN
          <input id="belmEditConfirmPin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off">
        </label>
        <label id="belmEditConfirmPasswordWrap" hidden>Your current admin password
          <input id="belmEditConfirmPassword" type="password" autocomplete="current-password">
        </label>
        <button type="button" class="belm-edit-confirm-switch" id="belmEditConfirmSwitch" hidden>Use my admin password instead</button>
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
      .belm-edit-confirm-switch { justify-self: start; padding: 0; border: 0; background: transparent; color: #0b5ea8; font-size: 12px; font-weight: 800; cursor: pointer; text-decoration: underline; }
      #belmEditConfirmDialog label[hidden], .belm-edit-confirm-switch[hidden] { display: none; }
    `;
    document.head.appendChild(style);
  }

  // Returns a Promise resolving to { editPin } if confirmed, or null if cancelled.
  // V835: with { allowPassword: true } (login-detail edits) the user may confirm
  // with their own current admin password instead, resolving to { adminPassword }.
  // This keeps login edits possible when the Edit PIN is unknown or not configured.
  window.belmConfirmEdit = function (options = {}) {
    injectStyles();
    const dialog = ensureDialog();
    const allowPassword = Boolean(options.allowPassword);
    const pinWrap = document.getElementById("belmEditConfirmPinWrap");
    const passwordWrap = document.getElementById("belmEditConfirmPasswordWrap");
    const switchButton = document.getElementById("belmEditConfirmSwitch");
    let usePassword = false;
    function applyMode() {
      pinWrap.hidden = usePassword;
      passwordWrap.hidden = !usePassword;
      switchButton.hidden = !allowPassword;
      switchButton.textContent = usePassword ? "Use the Edit PIN instead" : "Use my admin password instead";
      document.getElementById("belmEditConfirmError").hidden = true;
      setTimeout(() => document.getElementById(usePassword ? "belmEditConfirmPassword" : "belmEditConfirmPin").focus(), 0);
    }
    function onSwitch() { usePassword = !usePassword; applyMode(); }
    document.getElementById("belmEditConfirmTitle").textContent = options.title || "Save changes?";
    document.getElementById("belmEditConfirmMessage").textContent =
      options.message || (allowPassword
        ? "Enter the Edit PIN, or use your current admin password, to confirm these changes."
        : "Enter the edit PIN to confirm these changes.");
    document.getElementById("belmEditConfirmPin").value = "";
    document.getElementById("belmEditConfirmPassword").value = "";
    document.getElementById("belmEditConfirmError").hidden = true;
    applyMode();
    switchButton.addEventListener("click", onSwitch);
    dialog.showModal();

    return new Promise((resolve) => {
      function cleanup() {
        dialog.close();
        submitButton.removeEventListener("click", onSubmit);
        cancelButton.removeEventListener("click", onCancel);
        closeButton.removeEventListener("click", onCancel);
        switchButton.removeEventListener("click", onSwitch);
        dialog.removeEventListener("cancel", onEscape);
        dialog.removeEventListener("keydown", onKeydown);
      }
      function onEscape(event) {
        event.preventDefault();
        onCancel();
      }
      function onKeydown(event) {
        if (event.key === "Enter" && event.target && event.target.tagName === "INPUT") {
          event.preventDefault();
          onSubmit();
        }
      }
      function onCancel() {
        cleanup();
        resolve(null);
      }
      function onSubmit() {
        const editPin = document.getElementById("belmEditConfirmPin").value.trim();
        const errorBox = document.getElementById("belmEditConfirmError");
        if (usePassword) {
          const adminPassword = document.getElementById("belmEditConfirmPassword").value;
          if (!adminPassword) {
            errorBox.textContent = "Enter your current admin password.";
            errorBox.hidden = false;
            return;
          }
          cleanup();
          resolve({ adminPassword });
          return;
        }
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
      dialog.addEventListener("cancel", onEscape);
      dialog.addEventListener("keydown", onKeydown);
    });
  };
})();
