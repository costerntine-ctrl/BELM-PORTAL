(function () {
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("belm_admin_user") || "null");
  } catch (_) {}

  if (!user) return;
  if (user.role === "Technician") {
    window.location.replace("/tech");
    return;
  }

  const signedInUser = document.getElementById("signedInUser");
  if (signedInUser) {
    signedInUser.textContent = `${user.name || "User"} · ${user.role || "Assigned role"}`;
  }

  const visibleCards = Array.from(document.querySelectorAll(".menu-card"))
    .filter((card) => !card.hidden);
  document.getElementById("noAccessMessage")?.classList.toggle("hidden", visibleCards.length > 0);

  document.getElementById("logoutButton")?.addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/login/";
  });
})();
