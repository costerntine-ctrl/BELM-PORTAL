const form = document.getElementById("resetForm");
const errorBox = document.getElementById("formError");
const button = document.getElementById("resetButton");

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  errorBox.classList.add("hidden");
  if (!form.reportValidity()) return;

  const newPassword = document.getElementById("newPassword").value;
  if (newPassword !== document.getElementById("confirmPassword").value) {
    showError("New passwords do not match.");
    return;
  }

  button.disabled = true;
  button.textContent = "Changing password…";
  try {
    const response = await fetch("/api/auth/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("email").value.trim(),
        recoveryCode: document.getElementById("recoveryCode").value.trim(),
        newPassword
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Password could not be changed.");
    document.getElementById("newRecoveryCode").textContent = result.newRecoveryCode;
    document.getElementById("resetCard").classList.add("hidden");
    document.getElementById("successCard").classList.remove("hidden");
  } catch (error) {
    showError(error.message || "Password could not be changed.");
  } finally {
    button.disabled = false;
    button.textContent = "Change password";
  }
});

document.getElementById("copyRecoveryButton").addEventListener("click", async event => {
  await navigator.clipboard.writeText(document.getElementById("newRecoveryCode").textContent);
  event.currentTarget.textContent = "Recovery code copied";
});
