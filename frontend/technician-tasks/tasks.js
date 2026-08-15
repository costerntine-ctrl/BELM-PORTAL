(function () {
  const token = localStorage.getItem("belm_tech_token");
  const taskList = document.getElementById("taskList");
  const alertBox = document.getElementById("alertBox");
  let tasks = [];
  let filter = "PENDING";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[char]);
  }

  function tokenPayload() {
    if (!token) return null;
    try {
      const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(Array.from(atob(encoded))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")));
    } catch {
      return null;
    }
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(data?.error || "Request failed.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function render() {
    const visible = filter ? tasks.filter((task) => task.status === filter) : tasks;
    if (visible.length === 0) {
      taskList.innerHTML = '<div class="empty">No tasks in this section.</div>';
      return;
    }
    taskList.innerHTML = visible.map((task) => `
      <article class="task ${escapeHtml(task.priority)} ${escapeHtml(task.status)}">
        <div class="task-head"><div><h2>${escapeHtml(task.title)}</h2><div class="meta">${escapeHtml(task.customerName || "General BELM task")} · Assigned by ${escapeHtml(task.createdBy || "BELM Admin")}</div>${task.temporaryOverride ? `<div class="temporary-override">TEMPORARY OVERRIDE · Home: ${escapeHtml(task.homeCustomerName || "Assigned customer")}</div>` : ""}</div><span class="priority">${escapeHtml(task.priority)}</span></div>
        <p>${escapeHtml(task.description || "No additional details.")}</p>
        <div class="task-actions"><span class="due">${task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString()}` : "No due date"}</span>${task.status !== "DONE" ? `<button class="complete" type="button" data-done="${escapeHtml(task.id)}">Mark completed</button>` : "<span class=\"due\">Completed</span>"}</div>
      </article>
    `).join("");
  }

  async function load() {
    const payload = tokenPayload();
    if (!token || payload?.roleName !== "Technician" || !payload?.id) {
      taskList.innerHTML = '<div class="locked">Technician login required.<br><a href="/tech">Go to Technician login</a></div>';
      return;
    }
    try {
      tasks = await api(`/tasks/user/${payload.id}`);
      render();
    } catch (error) {
      taskList.innerHTML = '<div class="locked">Could not load your tasks.<br><a href="/tech">Log in again</a></div>';
      alertBox.textContent = error.message;
      alertBox.className = "alert error";
    }
  }

  taskList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-done]");
    if (!button) return;
    try {
      await api(`/tasks/${button.dataset.done}/done`, { method: "PUT" });
      await load();
      alertBox.textContent = "Task marked as completed.";
      alertBox.className = "alert";
    } catch (error) {
      alertBox.textContent = error.message;
      alertBox.className = "alert error";
    }
  });
  document.querySelector(".tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    filter = button.dataset.filter;
    for (const tab of document.querySelectorAll("[data-filter]")) tab.classList.toggle("active", tab === button);
    render();
  });
  document.getElementById("refreshButton").addEventListener("click", load);
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_tech_token");
    localStorage.removeItem("belm_tech_user");
    window.location.href = "/tech";
  });
  load();
})();
