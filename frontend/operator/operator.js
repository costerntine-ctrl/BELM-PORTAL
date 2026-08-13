(function () {
  const machineId = new URLSearchParams(window.location.search).get("machine") || "";
  let token = localStorage.getItem("belm_operator_token");
  let operatorName = localStorage.getItem("belm_operator_name") || "";
  let machineName = localStorage.getItem("belm_operator_machine_name") || "";

  const alertBox = document.getElementById("alertBox");
  function showAlert(message, isError = true) {
    alertBox.textContent = message;
    alertBox.className = `op-alert${isError ? " error" : ""}`;
  }
  function clearAlert() {
    alertBox.className = "op-alert hidden";
  }

  function showSection(id) {
    ["loginSection", "shiftSection", "signOutSection", "doneSection"].forEach((sectionId) => {
      document.getElementById(sectionId).classList.toggle("hidden", sectionId !== id);
    });
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/operator${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem("belm_operator_token");
        token = null;
      }
      throw new Error(data?.error || "Something went wrong.");
    }
    return data;
  }

  async function startShift() {
    showSection("shiftSection");
    document.getElementById("shiftMachineName").textContent = machineName || "MACHINE";
    document.getElementById("shiftGreeting").textContent = `Hello, ${operatorName}`;
    try {
      const result = await api("/sign-in", { method: "POST" });
      document.getElementById("containerCount").textContent = result.containerCount;
      document.getElementById("shiftSignedInAt").textContent = result.resumed
        ? "Continuing your open shift."
        : `Shift started at ${new Date().toLocaleTimeString("en-TZ", { hour: "2-digit", minute: "2-digit" })}.`;
    } catch (error) {
      showAlert(error.message);
    }
  }

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    if (!machineId) {
      showAlert("This link is missing the machine. Ask your Machine Admin for your operator link.");
      return;
    }
    const name = document.getElementById("loginName").value.trim();
    const pin = document.getElementById("loginPin").value.trim();
    const button = document.getElementById("loginButton");
    button.disabled = true;
    button.textContent = "Signing in…";
    try {
      const result = await api("/login", {
        method: "POST",
        body: JSON.stringify({ machineId, name, pin }),
      });
      token = result.token;
      operatorName = result.operator.name;
      machineName = result.operator.machineName;
      localStorage.setItem("belm_operator_token", token);
      localStorage.setItem("belm_operator_name", operatorName);
      localStorage.setItem("belm_operator_machine_name", machineName);
      await startShift();
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Sign in";
    }
  });

  document.getElementById("logContainerButton").addEventListener("click", async () => {
    const button = document.getElementById("logContainerButton");
    button.disabled = true;
    try {
      const result = await api("/log-container", { method: "POST" });
      document.getElementById("containerCount").textContent = result.containerCount;
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("signOutButton").addEventListener("click", () => {
    clearAlert();
    document.getElementById("problemDescription").value = "";
    document.getElementById("problemLabel").classList.add("hidden");
    document.getElementById("confirmSignOutButton").disabled = true;
    document.getElementById("confirmSignOutButton").dataset.choice = "";
    document.querySelectorAll(".op-toggle").forEach((btn) => btn.classList.remove("active"));
    showSection("signOutSection");
  });
  document.getElementById("cancelSignOutButton").addEventListener("click", () => showSection("shiftSection"));

  document.getElementById("reportOkButton").addEventListener("click", () => {
    document.querySelectorAll(".op-toggle").forEach((btn) => btn.classList.remove("active"));
    document.getElementById("reportOkButton").classList.add("active");
    document.getElementById("problemLabel").classList.add("hidden");
    document.getElementById("confirmSignOutButton").disabled = false;
    document.getElementById("confirmSignOutButton").dataset.choice = "ok";
  });
  document.getElementById("reportProblemButton").addEventListener("click", () => {
    document.querySelectorAll(".op-toggle").forEach((btn) => btn.classList.remove("active"));
    document.getElementById("reportProblemButton").classList.add("active");
    document.getElementById("problemLabel").classList.remove("hidden");
    document.getElementById("confirmSignOutButton").disabled = false;
    document.getElementById("confirmSignOutButton").dataset.choice = "problem";
  });

  document.getElementById("confirmSignOutButton").addEventListener("click", async () => {
    const choice = document.getElementById("confirmSignOutButton").dataset.choice;
    const description = document.getElementById("problemDescription").value.trim();
    if (choice === "problem" && !description) {
      showAlert("Describe the challenge before confirming.");
      return;
    }
    const button = document.getElementById("confirmSignOutButton");
    button.disabled = true;
    button.textContent = "Signing out…";
    try {
      const result = await api("/sign-out", {
        method: "POST",
        body: JSON.stringify({ hasProblem: choice === "problem", problemDescription: description }),
      });
      document.getElementById("doneSummary").textContent =
        `Containers handled: ${result.containerCount}. ${choice === "problem" ? "Your challenge report was sent." : "No problems reported — great work!"}`;
      showSection("doneSection");
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Confirm sign out";
    }
  });

  document.getElementById("startNewShiftButton").addEventListener("click", startShift);

  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_operator_token");
    localStorage.removeItem("belm_operator_name");
    localStorage.removeItem("belm_operator_machine_name");
    token = null;
    document.getElementById("loginForm").reset();
    showSection("loginSection");
  });

  if (token) {
    startShift();
  } else {
    showSection("loginSection");
  }
})();
