(function () {
  const root = document.documentElement;
  const VALID = new Set(["light", "dark"]);
  let activeIdentity = null;
  let activeToken = null;
  let syncGeneration = 0;

  function decodeJwt(token) {
    if (!token) return null;
    try {
      const raw = token.split(".")[1];
      if (!raw) return null;
      const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
      const json = decodeURIComponent(Array.from(atob(padded))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""));
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  function tokenIsLive(token) {
    const payload = decodeJwt(token);
    if (!payload) return false;
    if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) return false;
    return true;
  }

  function candidateTokenKeys() {
    const path = location.pathname;
    if (path.startsWith("/portal") || path.startsWith("/customer-")) {
      return ["belm_customer_token", "belm_admin_token", "belm_tech_token", "belm_operator_token"];
    }
    if (path.startsWith("/tech") || path.startsWith("/technician-")) {
      return ["belm_tech_token", "belm_admin_token", "belm_customer_token", "belm_operator_token"];
    }
    if (path.startsWith("/operator")) {
      return ["belm_operator_token", "belm_customer_token", "belm_admin_token", "belm_tech_token"];
    }
    return ["belm_admin_token", "belm_tech_token", "belm_customer_token", "belm_operator_token"];
  }

  function currentSession() {
    for (const key of candidateTokenKeys()) {
      const token = localStorage.getItem(key);
      if (!token || !tokenIsLive(token)) continue;
      const payload = decodeJwt(token);
      if (!payload) continue;
      return { token, payload, tokenKey: key };
    }
    return null;
  }

  function identityFromPayload(payload) {
    if (!payload) return null;
    if (payload.type === "staff" && payload.id) {
      return { accountType: "staff", accountId: String(payload.id) };
    }
    if (payload.type === "customer") {
      if (payload.actorType === "assistant" && payload.actorId) {
        return { accountType: "customer-assistant", accountId: String(payload.actorId) };
      }
      if (payload.id) return { accountType: "customer-owner", accountId: String(payload.id) };
    }
    if (payload.type === "operator" && payload.id) {
      return { accountType: "operator", accountId: String(payload.id) };
    }
    return null;
  }

  function identityKey(identity) {
    return identity ? `${identity.accountType}:${identity.accountId}` : "public";
  }

  function storageKey(identity) {
    return `belm_personal_theme_${identity.accountType}_${identity.accountId}`;
  }

  function legacyTheme(identity, payload) {
    if (!identity) return null;
    const exact = localStorage.getItem(storageKey(identity));
    if (VALID.has(exact)) return exact;

    // Migrate only keys that definitely belonged to this exact account.
    if (identity.accountType === "staff") {
      const adminLegacy = localStorage.getItem(`belm_theme_admin_${identity.accountId}`);
      if (VALID.has(adminLegacy)) return adminLegacy;
      const oldGlobal = localStorage.getItem("belm_theme");
      if (VALID.has(oldGlobal)) return oldGlobal;
    }
    if (identity.accountType === "customer-owner") {
      const customerLegacy = localStorage.getItem(`belm_customer_theme_${payload.id}`);
      if (VALID.has(customerLegacy)) return customerLegacy;
    }
    // Do not migrate the old customer-id key for assistants because that key
    // was shared by every assistant in a company and was the source of the bug.
    return null;
  }

  function apply(theme, persistLocal = true) {
    const safe = theme === "dark" ? "dark" : "light";
    root.dataset.theme = safe;
    root.classList.toggle("dark", safe === "dark");
    root.style.colorScheme = safe;
    if (persistLocal && activeIdentity) {
      localStorage.setItem(storageKey(activeIdentity), safe);
    }
    updateToggleLabels();
    window.dispatchEvent(new CustomEvent("belm-theme-change", { detail: { theme: safe } }));
    return safe;
  }

  function currentTheme() {
    return root.dataset.theme === "dark" ? "dark" : "light";
  }

  async function saveRemote(theme) {
    if (!activeToken) return;
    try {
      await fetch("/api/preferences", {
        method: "PUT",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ theme }),
      });
    } catch (_) {
      // Local preference still keeps every page on this device consistent.
    }
  }

  async function setTheme(theme) {
    const safe = apply(theme, true);
    await saveRemote(safe);
    return safe;
  }

  async function toggle() {
    return setTheme(currentTheme() === "dark" ? "light" : "dark");
  }

  function updateToggleLabels() {
    const dark = currentTheme() === "dark";
    document.querySelectorAll("[data-belm-theme-toggle]").forEach((button) => {
      button.textContent = dark ? "☀ Light mode" : "☾ Dark mode";
      button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      button.title = dark ? "Switch to light mode" : "Switch to dark mode";
    });
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      button.classList.toggle("active", button.dataset.themeChoice === currentTheme());
    });
  }

  function injectPersonalToggle() {
    if (!activeIdentity) return;
    if (document.querySelector("[data-belm-theme-toggle]")) return;
    // Admin pages already have a natural location in the sidebar. Give the
    // sidebar a moment to render before using the universal floating control.
    if (document.getElementById("belmAdminSidebar")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "belm-global-theme-toggle";
    button.dataset.belmThemeToggle = "1";
    button.addEventListener("click", () => toggle());
    document.body.appendChild(button);
    updateToggleLabels();
  }

  async function initializeForSession() {
    const session = currentSession();
    const identity = identityFromPayload(session?.payload);
    const nextKey = identityKey(identity);
    const oldKey = identityKey(activeIdentity);

    if (!identity || !session) {
      activeIdentity = null;
      activeToken = null;
      root.dataset.theme = "light";
      root.classList.remove("dark");
      root.style.colorScheme = "light";
      document.querySelectorAll(".belm-global-theme-toggle").forEach((el) => el.remove());
      return;
    }

    if (nextKey === oldKey && activeToken === session.token) {
      injectPersonalToggle();
      return;
    }

    activeIdentity = identity;
    activeToken = session.token;
    const generation = ++syncGeneration;
    const local = legacyTheme(identity, session.payload) || "light";
    apply(local, true);

    try {
      const response = await fetch("/api/preferences", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (generation !== syncGeneration || !response.ok) {
        injectPersonalToggle();
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (VALID.has(data.theme)) {
        apply(data.theme, true);
      } else {
        // First use: persist the user's current local choice to their account.
        await saveRemote(local);
      }
    } catch (_) {}

    injectPersonalToggle();
  }

  window.BELMTheme = {
    get: currentTheme,
    set: setTheme,
    toggle,
    refresh: initializeForSession,
    updateLabels: updateToggleLabels,
  };

  function boot() {
    initializeForSession();
    setTimeout(injectPersonalToggle, 450);
    // SPA logins/routes can create a token without a full page reload.
    setInterval(initializeForSession, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
