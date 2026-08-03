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
    showAlert("Choose a machine from the Customer dashboard.", true);
    document.getElementById("entryPanel").classList.add("hidden");
    return;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[character]);
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}`;
  }

  function tokenPayload() {
    try {
      const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
      return JSON.parse(decodeURIComponent(Array.from(atob(padded))
        .map(character => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")));
    } catch (_) {
      return {};
    }
  }

  function showAlert(message, isError = false) {
    alertBox.textContent = message;
    alertBox.className = `alert${isError ? " error" : ""}`;
  }

  function clearAlert() {
    alertBox.textContent = "";
    alertBox.className = "alert hidden";
  }

  function hasReceipt(value) {
    return value === true || value === 1 || value === "1" || value === "t" || value === "true";
  }

  function clearReceiptInput() {
    receiptPhotoData = "";
    receiptPhotoName = "";
    document.getElementById("receiptPhoto").value = "";
    document.getElementById("receiptPreview").removeAttribute("src");
    document.getElementById("receiptPreviewWrap").classList.add("hidden");
  }

  function compressReceipt(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
        reject(new Error("Receipt must be a JPG, PNG or WebP image."));
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
          const compressed = canvas.toDataURL("image/jpeg", 0.78);
          if (compressed.length > 2.8 * 1024 * 1024) {
            reject(new Error("Receipt photo is too large. Choose a smaller or clearer crop."));
            return;
          }
          resolve(compressed);
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/customer-portal${path}`, {
      ...options,
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

  function calculateTotal() {
    const amount = Number(document.getElementById("amount").value || 0);
    document.getElementById("calculatedTotal").textContent = `Amount: ${money.format(amount)}`;
  }

  function render(data) {
    const machine = data.machine || {};
    const summary = data.summary || {};
    const account = data.account || {};
    document.getElementById("pageTitle").textContent =
      `${machine.brand ? `${machine.brand} ` : ""}${machine.model || "Machine"} petty cash`;
    document.getElementById("machineDetails").textContent = [
      machine.machineType,
      machine.serialNumber ? `Serial: ${machine.serialNumber}` : "",
      machine.regNumber ? `Registration: ${machine.regNumber}` : "",
    ].filter(Boolean).join(" · ");
    document.getElementById("balanceAmount").textContent = money.format(Number(account.balance || 0));
    document.getElementById("totalToppedUp").textContent = money.format(Number(account.totalToppedUp || 0));
    document.getElementById("totalUsed").textContent = money.format(Number(account.totalUsed || 0));
    document.getElementById("totalCost").textContent = money.format(Number(summary.totalCost || 0));
    document.getElementById("recordCount").textContent =
      Number(summary.recordCount || 0).toLocaleString("en-TZ");
    document.getElementById("averageCost").textContent =
      money.format(Number(summary.averageCost || 0));
    document.getElementById("receiptCount").textContent =
      Number(summary.receiptCount || 0).toLocaleString("en-TZ");

    const topups = Array.isArray(account.topups) ? account.topups : [];
    document.getElementById("topupRows").innerHTML = topups.length
      ? topups.map(topup => `<tr>
          <td>${formatDate(topup.createdAt)}</td>
          <td><strong>${money.format(Number(topup.amount || 0))}</strong></td>
          <td>${escapeHtml(topup.note || "—")}</td>
          <td>${escapeHtml(topup.addedBy || "BELM Admin")}</td>
        </tr>`).join("")
      : '<tr><td colspan="4" class="empty">No top-ups yet.</td></tr>';

    const rows = Array.isArray(data.entries) ? data.entries : [];
    document.getElementById("expenseRows").innerHTML = rows.length
      ? rows.map(entry => `<tr>
          <td>${formatDate(entry.date)}</td>
          <td>${escapeHtml(entry.description)}</td>
          <td><strong>${money.format(Number(entry.cost || 0))}</strong></td>
          <td>${hasReceipt(entry.has_receipt)
            ? `<button class="receipt-button" type="button" data-receipt="${escapeHtml(entry.id)}">View photo</button>
               <button class="receipt-button" type="button" data-print-receipt="${escapeHtml(entry.id)}">Print</button>`
            : "—"}</td>
          <td>${escapeHtml(entry.logged_by || "Customer")}</td>
        </tr>`).join("")
      : '<tr><td colspan="5" class="empty">No petty cash entries recorded yet.</td></tr>';
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

  async function load() {
    clearAlert();
    try {
      render(await api(`/petty-cash/${encodeURIComponent(machineId)}${currentRangeQuery()}`));
    } catch (error) {
      showAlert(error.message || "Could not load petty cash.", true);
    }
  }

  async function download(format) {
    const button = document.getElementById(`${format}Button`);
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing…";
    try {
      const response = await fetch(
        `/api/customer-portal/petty-cash/${encodeURIComponent(machineId)}/${format}${currentRangeQuery()}`,
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
      const disposition = response.headers.get("Content-Disposition") || "";
      const matchedName = disposition.match(/filename="([^"]+)"/i);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = matchedName?.[1] || `petty-cash.${format}`;
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

  async function viewReceipt(entryId) {
    try {
      const response = await fetch(
        `/api/customer-portal/petty-cash/${encodeURIComponent(machineId)}/receipt?expenseId=${encodeURIComponent(entryId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error("Could not load receipt photo.");
      const blob = await response.blob();
      if (openReceiptUrl) URL.revokeObjectURL(openReceiptUrl);
      openReceiptUrl = URL.createObjectURL(blob);
      document.getElementById("receiptImage").src = openReceiptUrl;
      document.getElementById("receiptDialog").showModal();
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  async function printReceipt(entryId) {
    try {
      const response = await fetch(
        `/api/customer-portal/petty-cash/${encodeURIComponent(machineId)}/receipt?expenseId=${encodeURIComponent(entryId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error("Could not load receipt photo.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const printWindow = window.open("", "_blank");
      printWindow.document.write(`<!doctype html><html><head><title>Receipt</title>
        <style>body{margin:0;display:flex;justify-content:center;padding:20px;font-family:sans-serif}
        img{max-width:100%;height:auto}</style></head>
        <body><img src="${url}" onload="window.print()"></body></html>`);
      printWindow.document.close();
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  document.getElementById("expenseDate").value = new Date().toISOString().slice(0, 10);
  document.getElementById("amount").addEventListener("input", calculateTotal);
  document.getElementById("receiptPhoto").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) {
      clearReceiptInput();
      return;
    }
    try {
      showAlert("Preparing and compressing receipt photo…");
      receiptPhotoData = await compressReceipt(file);
      receiptPhotoName = file.name || "receipt-photo.jpg";
      document.getElementById("receiptPreview").src = receiptPhotoData;
      document.getElementById("receiptPreviewWrap").classList.remove("hidden");
      clearAlert();
    } catch (error) {
      clearReceiptInput();
      showAlert(error.message, true);
    }
  });
  document.getElementById("removeReceiptButton").addEventListener("click", clearReceiptInput);
  document.getElementById("expenseRows").addEventListener("click", event => {
    const button = event.target.closest("[data-receipt]");
    const printButton = event.target.closest("[data-print-receipt]");
    if (button) viewReceipt(button.dataset.receipt);
    if (printButton) printReceipt(printButton.dataset.printReceipt);
  });
  document.getElementById("closeReceiptButton").addEventListener("click", () => {
    document.getElementById("receiptDialog").close();
  });
  document.getElementById("printScope").addEventListener("change", event => {
    document.getElementById("printDateInput").classList.toggle("hidden", event.target.value !== "date");
    document.getElementById("printMonthInput").classList.toggle("hidden", event.target.value !== "month");
    if (event.target.value === "all") load();
  });
  document.getElementById("printDateInput").addEventListener("change", load);
  document.getElementById("printMonthInput").addEventListener("change", load);
  document.getElementById("refreshButton").addEventListener("click", load);
  document.getElementById("csvButton").addEventListener("click", () => download("csv"));
  document.getElementById("pdfButton").addEventListener("click", () => download("pdf"));
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_customer_token");
    window.location.href = "/portal/login";
  });

  document.getElementById("expenseForm").addEventListener("submit", async event => {
    event.preventDefault();
    clearAlert();
    const saveButton = document.getElementById("saveButton");
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    try {
      await api(`/petty-cash/${encodeURIComponent(machineId)}`, {
        method: "POST",
        body: JSON.stringify({
          date: document.getElementById("expenseDate").value,
          description: document.getElementById("description").value.trim(),
          amount: Number(document.getElementById("amount").value),
          receiptPhoto: receiptPhotoData,
          receiptName: receiptPhotoName,
        }),
      });
      event.target.reset();
      clearReceiptInput();
      document.getElementById("expenseDate").value = new Date().toISOString().slice(0, 10);
      calculateTotal();
      await load();
      showAlert("Petty cash entry saved successfully.");
    } catch (error) {
      showAlert(error.message || "Could not save petty cash entry.", true);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save petty cash entry";
    }
  });

  if (String(tokenPayload().customerRole || "").toLowerCase() === "viewer") {
    document.getElementById("entryPanel").classList.add("hidden");
  }

  calculateTotal();
  load();
})();
