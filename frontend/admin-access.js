(function () {
  const token = localStorage.getItem("belm_admin_token");
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("belm_admin_user") || "null");
  } catch (_) {}

  if (!token || !user) {
    window.location.replace("/login");
    return;
  }

  // Production hardening: protected PDF/export links must never expose the
  // session JWT in browser history, proxy logs or copied URLs. Legacy pages
  // may still generate ?token= links; intercept them before navigation, strip
  // the token and perform the download with the Authorization header instead.
  (function installAuthorizedDownloadBridge() {
    const nativeOpen = window.open.bind(window);

    function protectedApiUrl(value) {
      try {
        const url = new URL(String(value || ""), window.location.origin);
        return url.origin === window.location.origin
          && url.pathname.startsWith("/api/")
          && url.searchParams.has("token");
      } catch (_) {
        return false;
      }
    }

    function cleanApiUrl(value) {
      const url = new URL(String(value || ""), window.location.origin);
      url.searchParams.delete("token");
      return `${url.pathname}${url.search}${url.hash}`;
    }

    async function authorizedOpen(value, targetWindow = null) {
      const response = await fetch(cleanApiUrl(value), {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        let message = "Could not open protected document.";
        try {
          const data = await response.json();
          message = data?.error || message;
        } catch (_) {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (targetWindow && !targetWindow.closed) {
        targetWindow.location.replace(objectUrl);
      } else {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.target = "_blank";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
    }

    document.addEventListener("click", (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link || link.hasAttribute("data-review-invoice")) return;
      const href = link.getAttribute("href");
      if (!protectedApiUrl(href)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const popup = nativeOpen("", link.target || "_blank");
      authorizedOpen(href, popup).catch((error) => {
        if (popup && !popup.closed) popup.close();
        console.error("BELM protected download failed", error);
        window.alert(error?.message || "Could not open protected document.");
      });
    }, true);

    window.open = function belmAuthorizedWindowOpen(url, target, features) {
      if (!protectedApiUrl(url)) return nativeOpen(url, target, features);
      const popup = nativeOpen("", target || "_blank", features);
      authorizedOpen(url, popup).catch((error) => {
        if (popup && !popup.closed) popup.close();
        console.error("BELM protected download failed", error);
        window.alert(error?.message || "Could not open protected document.");
      });
      return popup;
    };
  })();

  if (user.role === "Super Admin" || user.allowedPages === null) return;

  const allowedPages = Array.isArray(user.allowedPages) ? user.allowedPages : [];
  const routes = {
    customers: "/customers-manager/",
    overview: "/overview-manager/",
    roles: "/roles-manager/",
    "job-cards": "/belm-workshop/#job-cards",
    "service-requests": "/belm-workshop/#job-cards",
    "spare-parts": "/spare-parts-manager/",
    billing: "/billing-manager/",
    reports: "/reports-manager/",
    settings: "/settings-manager/",
    "checklist-templates": "/checklist-manager/",
    suppliers: "/suppliers-manager/",
    "activity-log": "/admin/activity-log"
  };
  const pathRules = [
    [/^\/customers-manager(?:\/|$)/, "customers"],
    [/^\/portal-cwm(?:\/|$)/, "customers"],
    [/^\/admin-applications(?:\/|$)/, "customers"],
    [/^\/overview-manager(?:\/|$)/, "overview"],
    [/^\/checklist-manager(?:\/|$)/, "checklist-templates"],
    [/^\/controller-pinouts-manager(?:\/|$)/, "checklist-templates"],
    [/^\/service-request-manager(?:\/|$)/, "job-cards"],
    [/^\/belm-workshop(?:\/|$)/, "job-cards"],
    [/^\/belm-procurement(?:\/|$)/, "spare-parts"],
    [/^\/spare-parts-manager(?:\/|$)/, "spare-parts"],
    [/^\/billing-manager(?:\/|$)/, "billing"],
    [/^\/bank-controller(?:\/|$)/, "bank-manager"],
    [/^\/roles-manager(?:\/|$)/, "roles"],
    [/^\/suppliers-manager(?:\/|$)/, "suppliers"],
    [/^\/reports-manager(?:\/|$)/, "reports"],
    [/^\/settings-manager(?:\/|$)/, "settings"],
    [/^\/recycle-bin(?:\/|$)/, "roles"],
    [/^\/admin\/([^/]+)/, null]
  ];

  function keyForPath(path) {
    for (const [pattern, key] of pathRules) {
      const match = path.match(pattern);
      if (!match) continue;
      return key || match[1];
    }
    return null;
  }

  // V453: /belm-workshop/ (Job Cards, Workshop Analysis, Technicians) is
  // reachable by anyone with "roles" OR "job-cards" OR "service-requests" -
  // same three keys admin-sidebar.js uses for this entry's anyKeys.
  function belmWorkshopAllowed(path) {
    const role = String(user.role || "").toLowerCase();
    return /^\/belm-workshop(?:\/|$)/.test(path)
      && ["procurement", "workshop manager", "engineer", "store keeper"].includes(role);
  }

  document.querySelectorAll("a[href]").forEach(link => {
    const href = new URL(link.getAttribute("href"), window.location.origin).pathname;
    const key = keyForPath(href);
    const workshopRoute = /^\/belm-workshop(?:\/|$)/.test(href);
    const workshopAllowed = belmWorkshopAllowed(href);
    if (key === "bank-manager" || (workshopRoute && !workshopAllowed) || (key && !workshopRoute && !allowedPages.includes(key))) link.hidden = true;
  });

  const currentKey = keyForPath(window.location.pathname);
  const isWorkshopRoute = /^\/belm-workshop(?:\/|$)/.test(window.location.pathname);
  const workshopAccess = belmWorkshopAllowed(window.location.pathname);
  const workshopBlocked = isWorkshopRoute && !workshopAccess;
  const bankControllerBlocked = currentKey === "bank-manager";
  if (!bankControllerBlocked && !workshopBlocked && (workshopAccess || !currentKey || allowedPages.includes(currentKey))) return;

  const firstAllowed = allowedPages.find(key => key !== "bank-manager" && routes[key]);
  if (firstAllowed) {
    window.location.replace(routes[firstAllowed]);
  } else if (user.role === "Technician") {
    window.location.replace("/tech");
  } else {
    // Permission assignment is not authentication failure. Keep the login alive
    // so an administrator can correct access without forcing a false logout loop.
    const showDenied = () => {
      if (document.getElementById("belmNoAssignedAccess")) return;
      const box = document.createElement("div");
      box.id = "belmNoAssignedAccess";
      box.style.cssText = "position:fixed;inset:20px;z-index:99999;display:grid;place-items:center;background:rgba(15,23,42,.58);padding:20px";
      box.innerHTML = '<div style="max-width:520px;background:#fff;border-radius:16px;padding:24px;box-shadow:0 18px 50px rgba(0,0,0,.24);font:14px Inter,system-ui,sans-serif;color:#172033"><h2 style="margin:0 0 10px">Access not assigned</h2><p style="margin:0">Your login is still active, but this role has no dashboard page assigned. Ask Super Admin to update the role permissions.</p></div>';
      document.body.appendChild(box);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showDenied, { once: true });
    else showDenied();
  }
})();
