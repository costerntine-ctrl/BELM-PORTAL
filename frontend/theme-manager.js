(function () {
  const root = document.documentElement;
  const VALID = new Set(["light", "dark"]);
  let activeIdentity = null;
  let activeToken = null;
  let syncGeneration = 0;

  // V299 - rolling session stability. Keep valid users signed in and recover
  // from a stale JWT before individual pages interpret one 401 as a logout.
  const nativeFetch = window.fetch.bind(window);
  const sessionRefreshes = new Map();
  const sessionRefreshStatus = new Map();
  const SESSION_KEYS = ["belm_admin_token", "belm_customer_token", "belm_tech_token", "belm_operator_token"];
  const SESSION_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;
  const SESSION_REFRESH_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

  function tokenStorageKey(token) {
    if (!token) return null;
    for (const key of SESSION_KEYS) {
      if (localStorage.getItem(key) === token) return key;
    }
    const payload = decodeJwt(token);
    if (!payload) return null;
    if (payload.type === "operator") return "belm_operator_token";
    if (payload.type === "customer") return "belm_customer_token";
    if (payload.type === "staff" && String(payload.roleName || "").toLowerCase() === "technician") return "belm_tech_token";
    if (payload.type === "staff") return "belm_admin_token";
    return null;
  }

  function sessionLastRefreshKey(tokenKey) {
    return `belm_session_refreshed_${tokenKey}`;
  }

  async function refreshSessionToken(tokenKey, force = false) {
    if (!tokenKey) return null;
    if (sessionRefreshes.has(tokenKey)) return sessionRefreshes.get(tokenKey);
    const token = localStorage.getItem(tokenKey);
    const payload = decodeJwt(token);
    // Do not reject only because the device clock says the JWT is expired.
    // The server is the authority; this also tolerates phones/laptops with clock skew.
    if (!token || !payload) return null;

    const last = Number(localStorage.getItem(sessionLastRefreshKey(tokenKey)) || 0);
    const remaining = typeof payload.exp === "number" ? payload.exp * 1000 - Date.now() : 0;
    if (!force && remaining > SESSION_REFRESH_WINDOW_MS && Date.now() - last < SESSION_REFRESH_INTERVAL_MS) return token;

    const promise = (async () => {
      try {
        const response = await nativeFetch("/api/auth/refresh", {
          method: "POST",
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        sessionRefreshStatus.set(tokenKey, response.status);
        if (!response.ok) return null;
        const data = await response.json().catch(() => ({}));
        if (!data.token) return null;
        // Do not overwrite a newer login that happened while refresh was in flight.
        if (localStorage.getItem(tokenKey) === token) {
          localStorage.setItem(tokenKey, data.token);
          localStorage.setItem(sessionLastRefreshKey(tokenKey), String(Date.now()));
        }
        return localStorage.getItem(tokenKey) || data.token;
      } catch (_) {
        // Network/Render wake-up failure is NOT a logout. Keep the current token
        // and let the next request/focus/online event retry session renewal.
        sessionRefreshStatus.set(tokenKey, 0);
        return null;
      } finally {
        sessionRefreshes.delete(tokenKey);
      }
    })();
    sessionRefreshes.set(tokenKey, promise);
    return promise;
  }

  function authTokenFromHeaders(headers) {
    try {
      const h = new Headers(headers || {});
      const value = h.get("Authorization") || "";
      return value.startsWith("Bearer ") ? value.slice(7) : null;
    } catch (_) {
      return null;
    }
  }

  function requestUrl(input) {
    try { return new URL(input instanceof Request ? input.url : String(input), location.origin); }
    catch (_) { return null; }
  }

  async function fetchWithStableSession(input, init = {}) {
    const url = requestUrl(input);
    const originalHeaders = init.headers || (input instanceof Request ? input.headers : undefined);
    const suppliedToken = authTokenFromHeaders(originalHeaders);
    const tokenKey = tokenStorageKey(suppliedToken);
    const latestToken = tokenKey ? localStorage.getItem(tokenKey) : null;
    const headers = new Headers(originalHeaders || {});
    if (tokenKey && latestToken) headers.set("Authorization", `Bearer ${latestToken}`);

    const firstInit = { ...init, headers };
    const firstInput = input instanceof Request ? new Request(input, firstInit) : input;
    let response = await nativeFetch(firstInput, input instanceof Request ? undefined : firstInit);

    const isRefreshCall = url && url.pathname === "/api/auth/refresh";
    if (response.status !== 401 || !tokenKey || isRefreshCall) return response;

    const refreshed = await refreshSessionToken(tokenKey, true);
    if (!refreshed) {
      const refreshStatus = sessionRefreshStatus.get(tokenKey);
      if (refreshStatus === 401) {
        // Only a server-confirmed invalid/expired session may clear login data.
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(sessionLastRefreshKey(tokenKey));
        if (tokenKey === "belm_admin_token") localStorage.removeItem("belm_admin_user");
        if (tokenKey === "belm_tech_token") localStorage.removeItem("belm_tech_user");
        return response;
      }
      // If refresh failed because the network/Render was temporarily unavailable,
      // never expose a 401 to legacy page code that would delete a valid token.
      const body = await response.blob();
      return new Response(body, {
        status: 503,
        statusText: "Session verification temporarily unavailable",
        headers: response.headers,
      });
    }

    // Session was proven valid by /auth/refresh. Retry the original request once
    // with the fresh token. This also fixes pages that captured an old token in
    // a const when the page first loaded.
    const retryHeaders = new Headers(originalHeaders || {});
    retryHeaders.set("Authorization", `Bearer ${refreshed}`);
    const retryInit = { ...init, headers: retryHeaders };
    const retryInput = input instanceof Request ? new Request(input, retryInit) : input;
    const retry = await nativeFetch(retryInput, input instanceof Request ? undefined : retryInit);

    if (retry.status !== 401) return retry;

    // A fresh, database-validated session receiving 401 from one endpoint means
    // that endpoint rejected this account type/route, not that the whole login
    // is dead. Surface it as forbidden so page-level code does not delete a
    // perfectly valid session token.
    const body = await retry.blob();
    return new Response(body, {
      status: 403,
      statusText: "Forbidden",
      headers: retry.headers,
    });
  }

  window.fetch = fetchWithStableSession;

  async function maintainSessions() {
    for (const key of SESSION_KEYS) {
      const token = localStorage.getItem(key);
      const payload = decodeJwt(token);
      if (!token || !payload) continue;
      const remaining = typeof payload.exp === "number" ? payload.exp * 1000 - Date.now() : 0;
      const last = Number(localStorage.getItem(sessionLastRefreshKey(key)) || 0);
      if (remaining <= SESSION_REFRESH_WINDOW_MS || Date.now() - last >= SESSION_REFRESH_INTERVAL_MS) {
        await refreshSessionToken(key, false);
      }
    }
  }

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

  window.BELMSession = {
    refresh: (tokenKey, force = true) => refreshSessionToken(tokenKey, force),
    maintain: maintainSessions,
    current: currentSession,
    isLive: tokenIsLive,
  };

  window.BELMTheme = {
    get: currentTheme,
    set: setTheme,
    toggle,
    refresh: initializeForSession,
    updateLabels: updateToggleLabels,
  };

  function boot() {
    initializeForSession();
    maintainSessions();
    setTimeout(injectPersonalToggle, 450);
    // SPA logins/routes can create a token without a full page reload.
    setInterval(initializeForSession, 1200);
    // Keep active sessions rolling without generating frequent API traffic.
    setInterval(maintainSessions, 5 * 60 * 1000);
    // Mobile browsers frequently suspend timers while the app is backgrounded.
    // Re-validate when the user returns instead of treating a stale request as logout.
    window.addEventListener("focus", maintainSessions);
    window.addEventListener("online", maintainSessions);
    window.addEventListener("pageshow", maintainSessions);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) maintainSessions();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
