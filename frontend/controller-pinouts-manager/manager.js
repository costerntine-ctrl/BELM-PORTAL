(function () {
  const token = localStorage.getItem("belm_admin_token");
  let pinouts = [];
  let pendingPhotos = []; // { label, data } — newly picked, not yet saved
  let existingPhotos = []; // photos already stored (edit mode)

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[character]));
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) {
      const error = new Error(data?.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function showAlert(message, isError = true) {
    const box = document.getElementById("pageAlert");
    box.textContent = message;
    box.className = isError ? "alert error" : "alert";
    box.classList.remove("hidden");
  }
  function formError(message) {
    const box = document.getElementById("formAlert");
    box.textContent = message;
    box.className = "alert error";
  }

  function renderGrid() {
    const query = document.getElementById("searchInput").value.trim().toLowerCase();
    const filtered = pinouts.filter((p) =>
      [p.machineBrand, p.controllerNumber, p.controllerBrand, p.system]
        .some((value) => String(value || "").toLowerCase().includes(query)));
    const grid = document.getElementById("pinoutGrid");
    if (!filtered.length) {
      grid.innerHTML = `<p class="empty">${query ? "No controllers match this search." : "No controllers saved yet. Select \u201c+ Add controller\u201d to create the first record."}</p>`;
      return;
    }
    grid.innerHTML = filtered.map((p) => `
      <article class="pinout-card">
        <div class="pinout-card-head">
          <div><b>${escapeHtml(p.controllerNumber)}</b><span>${escapeHtml(p.controllerBrand)}</span></div>
          <span class="badge">${escapeHtml(p.machineBrand)}</span>
        </div>
        ${p.system ? `<p class="pinout-system">${escapeHtml(p.system)}</p>` : ""}
        ${(p.photos || []).length ? `
          <div class="pinout-thumbs">
            ${p.photos.slice(0, 4).map((photo) => `
              <button type="button" class="pinout-thumb" data-view-photo="${escapeHtml(photo.id)}" data-photo-label="${escapeHtml(photo.label || "Photo")}">
                ${photo.photoMime === "application/pdf" ? "PDF" : "\u{1F5BC}"}
              </button>`).join("")}
            ${p.photos.length > 4 ? `<span class="pinout-thumb-more">+${p.photos.length - 4}</span>` : ""}
          </div>` : ""}
        <p class="pinout-pin-count">${(p.pins || []).length} pin(s) documented</p>
        <div class="pinout-card-actions">
          <button type="button" class="pdf" data-pdf="${escapeHtml(p.id)}" data-controller-number="${escapeHtml(p.controllerNumber)}">Download PDF</button>
          <button type="button" data-edit="${escapeHtml(p.id)}">Edit</button>
          <button type="button" class="delete" data-delete="${escapeHtml(p.id)}">Delete</button>
        </div>
      </article>`).join("");
  }

  async function loadPinouts() {
    if (!token) { window.location.href = "/admin/login"; return; }
    try {
      pinouts = await api("/controller-pinouts");
      renderGrid();
    } catch (error) {
      showAlert(error.message);
    }
  }

  function renderPhotosList() {
    const box = document.getElementById("photosList");
    const rows = [
      ...existingPhotos.map((photo) => ({ ...photo, isExisting: true })),
      ...pendingPhotos.map((photo, index) => ({ ...photo, isExisting: false, pendingIndex: index })),
    ];
    box.innerHTML = rows.length
      ? rows.map((photo) => `
          <div class="photo-row">
            <span class="photo-row-icon">${(photo.photoMime || photo.data || "").includes("pdf") ? "PDF" : "\u{1F5BC}"}</span>
            <input type="text" placeholder="Label (e.g. Right side, Top view)" value="${escapeHtml(photo.label || "")}"
              data-photo-label-input="${photo.isExisting ? escapeHtml(photo.id) : `pending-${photo.pendingIndex}`}">
            <button type="button" data-remove-photo="${photo.isExisting ? escapeHtml(photo.id) : `pending-${photo.pendingIndex}`}" data-existing="${photo.isExisting}">Remove</button>
          </div>`).join("")
      : '<p class="muted">No photos added yet.</p>';
  }

  function renderPinsList(pins) {
    const box = document.getElementById("pinsList");
    box.innerHTML = (pins || []).map((pin) => pinRowHtml(pin.pinLabel, pin.pinFunction)).join("")
      || pinRowHtml("", "");
  }
  function pinRowHtml(label, func) {
    return `
      <div class="pin-row">
        <input type="text" placeholder="Pin # / name" maxlength="100" value="${escapeHtml(label || "")}" data-pin-label>
        <input type="text" placeholder="Function (e.g. CAN-H, +12V ignition)" maxlength="500" value="${escapeHtml(func || "")}" data-pin-function>
        <button type="button" data-remove-pin-row>×</button>
      </div>`;
  }

  document.getElementById("addPinRowButton").addEventListener("click", () => {
    document.getElementById("pinsList").insertAdjacentHTML("beforeend", pinRowHtml("", ""));
  });
  document.getElementById("pinsList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-pin-row]");
    if (!button) return;
    button.closest(".pin-row").remove();
  });

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (file.type === "application/pdf") {
        if (file.size > 4 * 1024 * 1024) { reject(new Error("PDF must be 4MB or smaller.")); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not read that PDF."));
        reader.readAsDataURL(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        image.onerror = () => reject(new Error("Could not read that image."));
        image.src = reader.result;
      };
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.readAsDataURL(file);
    });
  }

  document.getElementById("photoInput").addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file);
        pendingPhotos.push({ label: "", data: dataUrl });
      } catch (error) {
        showAlert(error.message, true);
      }
    }
    event.target.value = "";
    renderPhotosList();
  });

  document.getElementById("photosList").addEventListener("input", (event) => {
    const input = event.target.closest("[data-photo-label-input]");
    if (!input) return;
    const key = input.dataset.photoLabelInput;
    if (key.startsWith("pending-")) {
      const index = Number(key.replace("pending-", ""));
      if (pendingPhotos[index]) pendingPhotos[index].label = input.value;
    } else {
      const photo = existingPhotos.find((p) => p.id === key);
      if (photo) photo.label = input.value;
    }
  });

  document.getElementById("photosList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove-photo]");
    if (!button) return;
    const key = button.dataset.removePhoto;
    if (button.dataset.existing === "true") {
      const confirmation = await window.belmConfirmEdit({
        title: "Remove this photo?",
        message: "This reference photo will be permanently removed from the controller record.",
      });
      if (!confirmation) return;
      try {
        await api(`/controller-pinouts/photo?photoId=${encodeURIComponent(key)}`, {
          method: "DELETE",
          body: JSON.stringify(confirmation),
        });
        existingPhotos = existingPhotos.filter((p) => p.id !== key);
        renderPhotosList();
      } catch (error) {
        showAlert(error.message, true);
      }
    } else {
      const index = Number(key.replace("pending-", ""));
      pendingPhotos.splice(index, 1);
      renderPhotosList();
    }
  });

  async function downloadPinoutPdf(id, controllerNumber) {
    if (!id) return;
    try {
      const response = await fetch(`/api/controller-pinouts/${encodeURIComponent(id)}/pdf`, {
        method: "GET",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token || ""}` },
      });
      if (!response.ok) {
        let message = `PDF download failed (${response.status}).`;
        try { message = (await response.json())?.error || message; } catch (_) {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeNumber = String(controllerNumber || "controller").replace(/[^A-Za-z0-9._-]+/g, "-");
      link.href = url;
      link.download = `Controller-Pinout-${safeNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    } catch (error) {
      showAlert(error.message);
    }
  }

  document.getElementById("pinoutGrid").addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view-photo]");
    if (viewButton) {
      document.getElementById("photoViewLabel").textContent = viewButton.dataset.photoLabel || "Photo";
      fetch(`/api/controller-pinouts/photo?photoId=${encodeURIComponent(viewButton.dataset.viewPhoto)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((response) => response.blob()).then((blob) => {
        const url = URL.createObjectURL(blob);
        document.getElementById("photoViewImage").src = url;
        document.getElementById("photoViewDialog").showModal();
      }).catch(() => showAlert("Could not load photo.", true));
      return;
    }
    const pdfButton = event.target.closest("[data-pdf]");
    if (pdfButton) { downloadPinoutPdf(pdfButton.dataset.pdf, pdfButton.dataset.controllerNumber); return; }
    const editButton = event.target.closest("[data-edit]");
    if (editButton) { openPinout(pinouts.find((p) => p.id === editButton.dataset.edit)); return; }
    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) deletePinout(deleteButton.dataset.delete);
  });
  document.getElementById("closePhotoViewButton").addEventListener("click", () => document.getElementById("photoViewDialog").close());

  function openPinout(pinout = null) {
    pendingPhotos = [];
    existingPhotos = pinout?.photos ? pinout.photos.map((p) => ({ ...p })) : [];
    document.getElementById("pinoutForm").reset();
    document.getElementById("pinoutId").value = pinout?.id || "";
    document.getElementById("dialogTitle").textContent = pinout ? "Edit controller" : "Add controller";
    document.getElementById("machineBrand").value = pinout?.machineBrand || "";
    document.getElementById("controllerNumber").value = pinout?.controllerNumber || "";
    document.getElementById("controllerBrand").value = pinout?.controllerBrand || "";
    document.getElementById("system").value = pinout?.system || "";
    document.getElementById("notes").value = pinout?.notes || "";
    renderPhotosList();
    renderPinsList(pinout?.pins || []);
    document.getElementById("formAlert").className = "alert error hidden";
    document.getElementById("pinoutDialog").showModal();
    document.getElementById("machineBrand").focus();
  }
  document.getElementById("addButton").addEventListener("click", () => openPinout());
  document.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => document.getElementById("pinoutDialog").close()));

  function collectPins() {
    return Array.from(document.querySelectorAll("#pinsList .pin-row")).map((row) => ({
      label: row.querySelector("[data-pin-label]").value.trim(),
      function: row.querySelector("[data-pin-function]").value.trim(),
    })).filter((pin) => pin.label !== "" || pin.function !== "");
  }

  document.getElementById("pinoutForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = document.getElementById("pinoutId").value;
    const payload = {
      machineBrand: document.getElementById("machineBrand").value.trim(),
      controllerNumber: document.getElementById("controllerNumber").value.trim(),
      controllerBrand: document.getElementById("controllerBrand").value.trim(),
      system: document.getElementById("system").value.trim(),
      notes: document.getElementById("notes").value.trim(),
      pins: collectPins(),
    };
    if (id) {
      payload.newPhotos = pendingPhotos.map((p) => ({ label: p.label, data: p.data }));
      const confirmation = await window.belmConfirmEdit({
        title: "Save controller changes?",
        message: "Confirm changes to this controller pinout record.",
      });
      if (!confirmation) return;
      Object.assign(payload, confirmation);
    } else {
      payload.photos = pendingPhotos.map((p) => ({ label: p.label, data: p.data }));
    }

    const button = document.getElementById("saveButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await api(id ? `/controller-pinouts/${id}` : "/controller-pinouts", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      document.getElementById("pinoutDialog").close();
      await loadPinouts();
      showAlert(id ? "Controller updated successfully." : "Controller saved successfully.", false);
    } catch (error) {
      formError(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Save controller";
    }
  });

  async function deletePinout(id) {
    const pinout = pinouts.find((p) => p.id === id);
    if (!pinout) return;
    const confirmation = await window.belmConfirmDelete({
      title: "Delete controller record?",
      message: `Delete "${pinout.controllerNumber}"? It will move to the Recycle Bin.`,
    });
    if (!confirmation) return;
    try {
      await api(`/controller-pinouts/${id}`, { method: "DELETE", body: JSON.stringify(confirmation) });
      await loadPinouts();
      showAlert("Controller record deleted.", false);
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  document.getElementById("searchInput").addEventListener("input", renderGrid);

  loadPinouts();
})();
