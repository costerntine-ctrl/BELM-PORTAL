(function () {
  const form = document.getElementById("applyForm");
  const errorBox = document.getElementById("formError");
  const submitButton = document.getElementById("submitButton");
  const successPanel = document.getElementById("successPanel");
  const referenceValue = document.getElementById("referenceValue");

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function clearError() {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const payload = {
      applicationType: "CUSTOMER",
      companyName: document.getElementById("companyName").value.trim(),
      address: document.getElementById("address").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      website: document.getElementById("website").value, // honeypot, left blank by humans
    };

    if (!payload.companyName || !payload.address || !payload.email || !payload.phone) {
      showError("Please complete every field.");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Submitting…";

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) {}

      if (!response.ok) {
        throw new Error(data?.error || `Request failed (${response.status}).`);
      }

      form.classList.add("hidden");
      referenceValue.textContent = data?.reference || "";
      successPanel.classList.remove("hidden");
    } catch (error) {
      showError(error.message || "Something went wrong. Please try again.");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit registration request";
    }
  });
})();
