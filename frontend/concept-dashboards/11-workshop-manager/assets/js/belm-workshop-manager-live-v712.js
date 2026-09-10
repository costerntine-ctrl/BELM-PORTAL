(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const preview = params.get("preview") === "1" || /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  const token = localStorage.getItem("belm_admin_token");

  if (!preview && !token) {
    window.location.replace("/login");
    return;
  }

  function readUser() {
    try { return JSON.parse(localStorage.getItem("belm_admin_user") || "null"); }
    catch (err) { console.warn('Workshop Manager dashboard: could not parse stored user record.', err); return null; }
  }

  const user = readUser();
  if (user) {
    const name = String(user.name || user.fullName || "").trim();
    const role = String(user.role || user.roleName || "Workshop Manager").trim();
    const copy = document.querySelector(".user-chip .user-copy");
    if (copy) {
      const strong = copy.querySelector("strong");
      const small = copy.querySelector("small");
      if (strong && name) strong.textContent = name;
      if (small) small.textContent = /engineer/i.test(role) ? "Workshop Manager" : (role || "Workshop Manager");
    }
    const avatar = document.querySelector(".user-chip .user-avatar");
    if (avatar && name) {
      avatar.textContent = name.split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join("") || "WM";
    }
  }

  // Keep the supplied dashboard design intact; make the existing header controls useful.
  const notificationButton = document.querySelector('.header-right .icon-btn[aria-label="Notifications"]');
  if (notificationButton) notificationButton.addEventListener("click", () => { window.location.href = "communication.html"; });

  const accountButton = document.querySelector('.header-right .icon-btn[aria-label="Account"]');
  if (accountButton) accountButton.addEventListener("click", () => { window.location.href = "my-profile.html"; });

  const themeButton = document.getElementById("themeToggle");
  if (themeButton) themeButton.addEventListener("click", () => { window.location.href = "workshop-settings.html"; });
})();
