(function () {
  const accountId = new URLSearchParams(window.location.search).get("account");
  if (accountId && accountId.includes("@")) {
    document.getElementById("email").value = accountId;
  }

  let currentEmail = "";

  // ---- Step 1: email -> send code ----
  const emailForm = document.getElementById("emailForm");
  const emailError = document.getElementById("emailFormError");
  const sendCodeButton = document.getElementById("sendCodeButton");

  async function sendCode(email) {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not send the verification code.");
    return result;
  }

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    emailError.classList.add("hidden");
    const email = document.getElementById("email").value.trim();
    sendCodeButton.disabled = true;
    sendCodeButton.textContent = "Sending…";
    try {
      await sendCode(email);
      currentEmail = email;
      document.getElementById("codeSentTo").textContent = `We sent a 6-digit code to ${email}. It expires in 10 minutes.`;
      document.getElementById("emailCard").classList.add("hidden");
      document.getElementById("codeCard").classList.remove("hidden");
      document.getElementById("code").focus();
    } catch (error) {
      emailError.textContent = error.message;
      emailError.classList.remove("hidden");
    } finally {
      sendCodeButton.disabled = false;
      sendCodeButton.textContent = "Send verification code";
    }
  });

  // ---- Step 2: code + new password -> reset ----
  const codeForm = document.getElementById("codeForm");
  const codeError = document.getElementById("codeFormError");
  const resetWithCodeButton = document.getElementById("resetWithCodeButton");

  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    codeError.classList.add("hidden");
    const newPassword = document.getElementById("newPassword2").value;
    if (newPassword !== document.getElementById("confirmPassword2").value) {
      codeError.textContent = "New passwords do not match.";
      codeError.classList.remove("hidden");
      return;
    }
    resetWithCodeButton.disabled = true;
    resetWithCodeButton.textContent = "Changing password…";
    try {
      const response = await fetch("/api/auth/reset-with-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: currentEmail,
          code: document.getElementById("code").value.trim(),
          newPassword,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Password could not be changed.");
      document.getElementById("codeCard").classList.add("hidden");
      document.getElementById("doneCard").classList.remove("hidden");
    } catch (error) {
      codeError.textContent = error.message;
      codeError.classList.remove("hidden");
    } finally {
      resetWithCodeButton.disabled = false;
      resetWithCodeButton.textContent = "Change password";
    }
  });

  document.getElementById("resendCodeButton").addEventListener("click", async () => {
    const button = document.getElementById("resendCodeButton");
    button.disabled = true;
    button.textContent = "Sending a new code…";
    try {
      await sendCode(currentEmail);
      button.textContent = "New code sent!";
    } catch (error) {
      codeError.textContent = error.message;
      codeError.classList.remove("hidden");
      button.textContent = "Didn't get it? Send a new code";
    } finally {
      button.disabled = false;
      setTimeout(() => { button.textContent = "Didn't get it? Send a new code"; }, 3000);
    }
  });

  document.getElementById("backToEmailButton").addEventListener("click", () => {
    document.getElementById("codeCard").classList.add("hidden");
    document.getElementById("emailCard").classList.remove("hidden");
  });
})();
