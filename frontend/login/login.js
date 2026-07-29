(function () {
  const form = document.getElementById("loginForm");
  const loginId = document.getElementById("loginId");
  const password = document.getElementById("password");
  const errorBox = document.getElementById("loginError");
  const button = document.getElementById("loginButton");
  const customerNote = document.getElementById("customerNote");

  const parameters = new URLSearchParams(window.location.search);
  const customerSlug = parameters.get("customer");
  const accountId = parameters.get("account");
  const roleHint = parameters.get("role");
  if (customerSlug) {
    loginId.value = customerSlug;
    customerNote.textContent = `Customer portal: ${customerSlug.replace(/-/g, " ")}`;
    customerNote.classList.remove("hidden");
  } else if (accountId) {
    loginId.value = accountId;
  }

  if (accountId) {
    document.getElementById("forgotPasswordLink").href =
      `/forgot-password/?account=${encodeURIComponent(accountId)}`;
  }

  if (roleHint === "admin") {
    document.getElementById("welcomeTitle").textContent = "Administrator login";
    document.getElementById("loginTitle").textContent = "Enter your Administrator credentials";
    document.getElementById("loginHint").textContent =
      "Only an approved Administrator account can open the administration dashboard.";
  }

  document.getElementById("togglePassword").addEventListener("click", (event) => {
    const showing = password.type === "text";
    password.type = showing ? "password" : "text";
    event.currentTarget.textContent = showing ? "Show" : "Hide";
    event.currentTarget.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  });

  function clearAccountSessions() {
    [
      "belm_admin_token",
      "belm_admin_user",
      "belm_tech_token",
      "belm_tech_user",
      "belm_customer_token",
    ].forEach((key) => localStorage.removeItem(key));
  }

  function saveAccount(result) {
    clearAccountSessions();
    if (result.accountType === "technician") {
      localStorage.setItem("belm_tech_token", result.token);
      localStorage.setItem("belm_tech_user", JSON.stringify(result.user));
      return "/tech";
    }
    if (result.accountType === "admin") {
      localStorage.setItem("belm_admin_token", result.token);
      localStorage.setItem("belm_admin_user", JSON.stringify(result.user));
      return "/admin-menu/";
    }
    if (result.accountType === "customer") {
      localStorage.setItem("belm_customer_token", result.token);
      return "/portal/dashboard";
    }
    throw new Error("This account has no assigned BELM workspace.");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.classList.add("hidden");
    if (!form.reportValidity()) return;

    button.disabled = true;
    button.textContent = "Checking account…";
    try {
      const response = await fetch("/api/auth/unified-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginId: loginId.value.trim(),
          password: password.value,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Login failed. Check your details and try again.");
      }
      const destination = saveAccount(result);
      sessionStorage.setItem("belm_login_destination", destination);
      button.textContent = "Opening your dashboard…";
      if (typeof window.BELM_NAVIGATE === "function") {
        window.BELM_NAVIGATE(destination);
      } else {
        window.location.assign(destination);
      }
    } catch (error) {
      errorBox.textContent = error.message || "Login failed. Please try again.";
      errorBox.classList.remove("hidden");
      button.disabled = false;
      button.textContent = "Sign in securely";
    }
  });
})();
