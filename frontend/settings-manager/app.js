(function () {
  const token = localStorage.getItem("belm_admin_token");

  function applyTheme(theme) {
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = safeTheme;
    document.documentElement.classList.toggle("dark", safeTheme === "dark");
    localStorage.setItem("belm_theme", safeTheme);
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      button.classList.toggle("active", button.dataset.themeChoice === safeTheme);
    });
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem("belm_admin_token");
      localStorage.removeItem("belm_admin_user");
      window.location.href = "/login/";
      throw new Error("Your login session has expired.");
    }
    if (!response.ok) throw new Error(data.error || "Could not save settings.");
    return data;
  }

  function message(text, isError = false) {
    const alert = document.getElementById("pageAlert");
    alert.textContent = text;
    alert.className = isError ? "alert" : "alert success";
    alert.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function saveSettings(values) {
    await Promise.all(Object.entries(values).map(([key, value]) =>
      api(`/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      })
    ));
  }

  async function load() {
    if (!token) {
      window.location.href = "/login/";
      return;
    }
    try {
      const settings = await api("/settings");
      const fields = {
        companyName: "companyName",
        companyEmail: "companyEmail",
        companyPhone: "companyPhone",
        companyAddress: "companyAddress",
        companyTin: "companyTin",
        companyVrn: "companyVrn",
        currency: "currency",
        timezone: "timezone",
        invoicePrefix: "invoicePrefix",
        proformaPrefix: "proformaPrefix",
        defaultVat: "defaultVat",
      };
      Object.entries(fields).forEach(([key, id]) => {
        if (settings[key] !== undefined && settings[key] !== null) {
          document.getElementById(id).value = settings[key];
        }
      });
      applyTheme(settings.displayTheme || localStorage.getItem("belm_theme") || "light");
    } catch (error) {
      message(error.message, true);
    }
  }

  document.getElementById("companyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("saveCompanyButton");
    button.disabled = true;
    try {
      await saveSettings({
        companyName: document.getElementById("companyName").value.trim(),
        companyEmail: document.getElementById("companyEmail").value.trim(),
        companyPhone: document.getElementById("companyPhone").value.trim(),
        companyAddress: document.getElementById("companyAddress").value.trim(),
        companyTin: document.getElementById("companyTin").value.trim(),
        companyVrn: document.getElementById("companyVrn").value.trim(),
      });
      message("Company settings saved successfully.");
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("businessForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("saveBusinessButton");
    button.disabled = true;
    try {
      await saveSettings({
        currency: document.getElementById("currency").value,
        timezone: document.getElementById("timezone").value.trim(),
        invoicePrefix: document.getElementById("invoicePrefix").value.trim(),
        proformaPrefix: document.getElementById("proformaPrefix").value.trim(),
        defaultVat: Number(document.getElementById("defaultVat").value || 0),
      });
      message("Business defaults saved successfully.");
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", async () => {
      const previous = localStorage.getItem("belm_theme") || "light";
      applyTheme(button.dataset.themeChoice);
      try {
        await saveSettings({ displayTheme: button.dataset.themeChoice });
        message(`${button.dataset.themeChoice === "dark" ? "Dark" : "Light"} theme saved.`);
      } catch (error) {
        applyTheme(previous);
        message(error.message, true);
      }
    });
  });

  document.getElementById("pinForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPin = document.getElementById("currentPin").value;
    const newPin = document.getElementById("newPin").value;
    const confirmPin = document.getElementById("confirmPin").value;
    if (newPin !== confirmPin) {
      message("New PIN and confirmation do not match.", true);
      return;
    }
    const button = document.getElementById("changePinButton");
    button.disabled = true;
    try {
      await api("/settings/admin-pin/change", {
        method: "PUT",
        body: JSON.stringify({ currentPin, newPin }),
      });
      event.currentTarget.reset();
      message("Protected delete PIN changed successfully.");
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  applyTheme(localStorage.getItem("belm_theme") || "light");
  load();
})();
