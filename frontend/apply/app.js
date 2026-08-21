const form = document.getElementById("applicationForm");
const applicationType = document.getElementById("applicationType");
const customerFields = document.getElementById("customerFields");
const userFields = document.getElementById("userFields");
const errorBox = document.getElementById("formError");
const submitButton = document.getElementById("submitButton");

function setSectionEnabled(section, enabled) {
  section.classList.toggle("hidden", !enabled);
  section.querySelectorAll("input, select, textarea").forEach(field => {
    field.disabled = !enabled;
    if (field.dataset.required !== undefined) field.required = enabled;
  });
}

function updateRegistrationType() {
  const isCustomer = applicationType.value === "CUSTOMER";
  setSectionEnabled(customerFields, isCustomer);
  setSectionEnabled(userFields, !isCustomer);
}

applicationType.addEventListener("change", updateRegistrationType);
updateRegistrationType();

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
  errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  errorBox.classList.add("hidden");
  if (!form.reportValidity()) return;

  const data = Object.fromEntries(new FormData(form).entries());
  delete data.consent;

  submitButton.disabled = true;
  submitButton.textContent = "Submitting registration…";
  try {
    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not submit the application.");

    document.getElementById("referenceNo").textContent = result.reference || "SUBMITTED";
    document.getElementById("applicationCard").classList.add("hidden");
    document.getElementById("successCard").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    showError(error.message || "Could not submit the application. Try again.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit registration request";
  }
});
