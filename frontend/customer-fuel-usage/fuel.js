(function () {
  const token = localStorage.getItem("belm_customer_token");
  const machineId = new URLSearchParams(window.location.search).get("machine") || "";
  const alertBox = document.getElementById("alertBox");
  let receiptPhotoData = "";
  let receiptPhotoName = "";
  let openReceiptUrl = "";
  const money = new Intl.NumberFormat("en-TZ", {
    style: "currency",
    currency: "TZS",
    maximumFractionDigits: 2,
  });

  if (!token) {
    window.location.replace("/portal/login");
    return;
  }
  if (!machineId) {
    document.getElementById("machineDetails").textContent = "No machine selected. Go back to the dashboard and choose a machine.";
    document.getElementById("entryPanel").classList.add("hidden");
    return;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[character]);
  }

  function showAlert(message, isError = false) {
    alertBox.textContent = message;
    alertBox.className = `alert${isError ? " error" : ""}`;
  }

  function hasReceipt(value) {
    return value === true || value === 1 || value === "1" || value === "t" || value === "true";
  }

  function clearReceiptInput() {
    receiptPhotoData = "";
    receiptPhotoName = "";
    document.getElementById("receiptPhoto").value = "";
    document.getElementById("receiptPreviewWrap").classList.add("hidden");
  }

  function compressReceipt(file) {
    if (file.type === "application/pdf") {
      return new Promise((resolve, reject) => {
        if (file.size > 4 * 1024 * 1024) {
          reject(new Error("Receipt PDF is too large (max 4MB)."));
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read the receipt PDF."));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
        reject(new Error("Receipt must be a JPG, PNG, WebP image, or a PDF."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the receipt photo."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Receipt photo is not a valid image."));
        image.onload = () => {
          const maximum = 1280;
          const scale = Math.min(1, maximum / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.78));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/customer-portal${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      let message = "Request failed.";
      try {
        const error = await response.json();
        message = error.error || message;
      } catch (_) {}
      if (response.status === 401) {
        localStorage.removeItem("belm_customer_token");
        window.location.replace("/portal/login");
      }
      throw new Error(message);
    }
    return response.status === 204 ? null : response.json();
  }

  function currentRangeQuery() {
    const scope = document.getElementById("printScope").value;
    if (scope === "date") {
      const value = document.getElementById("printDateInput").value;
      return value ? `?date=${encodeURIComponent(value)}` : "";
    }
    if (scope === "month") {
      const value = document.getElementById("printMonthInput").value;
      return value ? `?month=${encodeURIComponent(value)}` : "";
    }
    return "";
  }

  document.getElementById("printScope").addEventListener("change", (event) => {
    document.getElementById("printDateInput").classList.toggle("hidden", event.target.value !== "date");
    document.getElementById("printMonthInput").classList.toggle("hidden", event.target.value !== "month");
    load();
  });
  document.getElementById("printDateInput").addEventListener("change", load);
  document.getElementById("printMonthInput").addEventListener("change", load);

  function renderRows(entries) {
    const body = document.getElementById("fuelRows");
    if (!entries.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty">No fuel entries recorded yet.</td></tr>';
      return;
    }
    body.innerHTML = entries.map((entry) => `
      <tr>
        <td>${formatDate(entry.date)}</td>
        <td>${escapeHtml(entry.quantity)} L</td>
        <td>${money.format(entry.unitPrice || 0)}</td>
        <td><strong>${money.format(entry.cost || 0)}</strong></td>
        <td>${escapeHtml(entry.description || "—")}</td>
        <td>${hasReceipt(entry.hasReceipt)
          ? `<button class="receipt-button" type="button" data-receipt="${escapeHtml(entry.id)}">View</button>
             <button class="receipt-button" type="button" data-download-receipt="${escapeHtml(entry.id)}">Download</button>`
          : "—"}</td>
        <td>${escapeHtml(entry.loggedBy || "—")}</td>
      </tr>`).join("");
  }

  async function load() {
    try {
      const data = await api(`/fuel-usage/${encodeURIComponent(machineId)}${currentRangeQuery()}`);
      const machineName = [data.machine.brand, data.machine.model].filter(Boolean).join(" ") || data.machine.machineType;
      document.getElementById("pageTitle").textContent = `Fuel usage — ${machineName}`;
      document.getElementById("machineDetails").textContent =
        `${data.machine.machineType || "Machine"} · Serial ${data.machine.serialNumber || data.machine.regNumber || "—"}`;
      document.getElementById("totalCost").textContent = money.format(data.summary.totalCost || 0);
      document.getElementById("totalLitres").textContent = `${data.summary.totalLitres || 0} L`;
      document.getElementById("recordCount").textContent = data.summary.recordCount || 0;
      document.getElementById("averageCost").textContent = money.format(data.summary.averageCostPerFillUp || 0);
      document.getElementById("receiptCount").textContent = data.summary.receiptCount || 0;
      renderRows(data.entries || []);
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  function calculateTotal() {
    const litres = Number(document.getElementById("litres").value) || 0;
    const unitPrice = Number(document.getElementById("unitPrice").value) || 0;
    document.getElementById("calculatedTotal").textContent = `Total: ${money.format(litres * unitPrice)}`;
  }
  document.getElementById("litres").addEventListener("input", calculateTotal);
  document.getElementById("unitPrice").addEventListener("input", calculateTotal);

  document.getElementById("fuelDate").value = new Date().toISOString().slice(0, 10);
  document.getElementById("receiptPhoto").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) { clearReceiptInput(); return; }
    try {
      receiptPhotoData = await compressReceipt(file);
      receiptPhotoName = file.name;
      const preview = document.getElementById("receiptPreview");
      if (file.type === "application/pdf") {
        preview.style.display = "none";
      } else {
        preview.src = receiptPhotoData;
        preview.style.display = "";
      }
      document.getElementById("receiptPreviewWrap").classList.remove("hidden");
    } catch (error) {
      showAlert(error.message, true);
      clearReceiptInput();
    }
  });
  document.getElementById("removeReceiptButton").addEventListener("click", clearReceiptInput);

  let isSubmitting = false;
  document.getElementById("fuelForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;
    const button = document.getElementById("saveButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await api(`/fuel-usage/${encodeURIComponent(machineId)}`, {
        method: "POST",
        body: JSON.stringify({
          date: document.getElementById("fuelDate").value,
          litres: Number(document.getElementById("litres").value),
          unitPrice: Number(document.getElementById("unitPrice").value),
          description: document.getElementById("description").value.trim(),
          receiptPhoto: receiptPhotoData || undefined,
          receiptName: receiptPhotoName || undefined,
        }),
      });
      showAlert("Fuel entry saved successfully.");
      document.getElementById("fuelForm").reset();
      document.getElementById("fuelDate").value = new Date().toISOString().slice(0, 10);
      clearReceiptInput();
      calculateTotal();
      await load();
    } catch (error) {
      showAlert(error.message, true);
    } finally {
      isSubmitting = false;
      button.disabled = false;
      button.textContent = "Save fuel entry";
    }
  });

  async function viewReceipt(entryId) {
    try {
      const response = await fetch(
        `/api/customer-portal/fuel-usage/${encodeURIComponent(machineId)}/receipt?expenseId=${encodeURIComponent(entryId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error("Could not load receipt.");
      const contentType = response.headers.get("Content-Type") || "";
      const blob = await response.blob();
      if (openReceiptUrl) URL.revokeObjectURL(openReceiptUrl);
      openReceiptUrl = URL.createObjectURL(blob);
      if (contentType === "application/pdf") {
        window.open(openReceiptUrl, "_blank");
        return;
      }
      document.getElementById("receiptImage").src = openReceiptUrl;
      document.getElementById("receiptDialog").showModal();
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  async function downloadReceipt(entryId) {
    try {
      const response = await fetch(
        `/api/customer-portal/fuel-usage/${encodeURIComponent(machineId)}/receipt?expenseId=${encodeURIComponent(entryId)}&download=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error("Could not download receipt.");
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const nameMatch = contentDisposition.match(/filename="([^"]+)"/);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = nameMatch ? nameMatch[1] : "fuel-receipt";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      showAlert(error.message || "Could not download receipt.", true);
    }
  }

  document.getElementById("fuelRows").addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-receipt]");
    const downloadButton = event.target.closest("[data-download-receipt]");
    if (viewButton) viewReceipt(viewButton.dataset.receipt);
    if (downloadButton) downloadReceipt(downloadButton.dataset.downloadReceipt);
  });
  document.getElementById("closeReceiptButton").addEventListener("click", () => {
    document.getElementById("receiptDialog").close();
  });

  async function download(format) {
    const button = document.getElementById(`${format}Button`);
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing…";
    try {
      const response = await fetch(
        `/api/customer-portal/fuel-usage/${encodeURIComponent(machineId)}/${format}${currentRangeQuery()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        let message = `Could not download ${format.toUpperCase()}.`;
        try {
          const error = await response.json();
          message = error.error || message;
        } catch (_) {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `fuel-usage.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      showAlert(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }
  document.getElementById("csvButton").addEventListener("click", () => download("csv"));
  document.getElementById("pdfButton").addEventListener("click", () => download("pdf"));

  document.getElementById("receiptsButton").addEventListener("click", downloadAllReceipts);
  async function downloadAllReceipts() {
    const button = document.getElementById("receiptsButton");
    button.disabled = true;
    button.textContent = "Finding receipts…";
    try {
      const list = await api(`/fuel-usage/${encodeURIComponent(machineId)}/receipts-list${currentRangeQuery()}`);
      if (!list.length) {
        showAlert("No receipts found for the selected range.", true);
        return;
      }
      button.textContent = `Downloading 0/${list.length}…`;
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const response = await fetch(`/api${item.downloadUrl}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) continue;
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = item.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
        button.textContent = `Downloading ${i + 1}/${list.length}…`;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      showAlert(`Downloaded ${list.length} receipt(s).`);
    } catch (error) {
      showAlert(error.message || "Could not download receipts.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Download Receipts";
    }
  }

  document.getElementById("machineExpensesLink").href = `/customer-machine-expenses/?machine=${encodeURIComponent(machineId)}`;
  document.getElementById("refreshButton").addEventListener("click", load);
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_customer_token");
    window.location.href = "/portal/login";
  });

  calculateTotal();
  load();
})();
