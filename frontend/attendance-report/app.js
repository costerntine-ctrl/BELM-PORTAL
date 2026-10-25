(function(){const token=localStorage.getItem('belm_admin_token');if(!token){location.replace('/login');return}const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const displayRoleName=v=>v;async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      cache: "no-store",
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
      window.location.href = "/login";
      throw new Error("Your login session has expired.");
    }
    if (!response.ok) throw new Error(data.error || "Report request failed.");
    return data;
  }
  function timeValue(value) {
    if (!value) return "";
    const match = String(value).match(/T(\d{2}:\d{2})/);
    if (match) return match[1];
    return String(value).slice(0, 5);
  }

  async function loadAttendance() {
    const date = document.getElementById("attendanceDate").value;
    const target = document.getElementById("attendanceTable");
    target.innerHTML = '<div class="empty-state">Loading employee attendance…</div>';
    try {
      const data = await api(`/reports/attendance?date=${encodeURIComponent(date)}`);
      const employees = data.employees || [];
      target.innerHTML = employees.length
        ? `<table><thead><tr><th>Employee</th><th>Role</th><th>Status</th><th>Check in</th><th>Check out</th><th>Notes</th><th class="no-print">Action</th></tr></thead>
          <tbody>${employees.map((employee) => `<tr data-user="${escapeHtml(employee.userId)}">
            <td><strong>${escapeHtml(employee.name)}</strong><br><small>${escapeHtml(employee.email)}</small></td>
            <td>${escapeHtml(displayRoleName(employee.roleName))}</td>
            <td><select data-field="status">
              ${["NOT_RECORDED", "PRESENT", "LATE", "ABSENT", "LEAVE", "REMOTE"].map((status) =>
                `<option value="${status}" ${status === employee.status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>`).join("")}
            </select></td>
            <td><input data-field="checkIn" type="time" value="${escapeHtml(timeValue(employee.checkIn))}"></td>
            <td><input data-field="checkOut" type="time" value="${escapeHtml(timeValue(employee.checkOut))}"></td>
            <td><input data-field="notes" value="${escapeHtml(employee.notes || "")}" maxlength="500"></td>
            <td class="no-print"><button data-save-attendance type="button">Save</button></td>
          </tr>`).join("")}</tbody></table>`
        : '<div class="empty-state">No active employees are available.</div>';
    } catch (error) {
      target.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  async function saveAttendance(button) {
    const row = button.closest("tr");
    const message = document.getElementById("attendanceMessage");
    const status = row.querySelector('[data-field="status"]').value;
    if (status === "NOT_RECORDED") {
      message.textContent = "Choose a recorded status before saving.";
      message.classList.remove("hidden");
      return;
    }
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const result = await api("/reports/attendance", {
        method: "POST",
        body: JSON.stringify({
          userId: row.dataset.user,
          workDate: document.getElementById("attendanceDate").value,
          status,
          checkIn: row.querySelector('[data-field="checkIn"]').value,
          checkOut: row.querySelector('[data-field="checkOut"]').value,
          notes: row.querySelector('[data-field="notes"]').value.trim(),
        }),
      });
      message.textContent = result.message || "Attendance saved.";
      message.classList.remove("hidden");
      await loadAttendance();
    } catch (error) {
      message.textContent = error.message;
      message.classList.remove("hidden");
      message.classList.remove("success");
    } finally {
      button.disabled = false;
      button.textContent = "Save";
    }
  }

document.getElementById('attendanceDate').value=new Date().toISOString().slice(0,10);document.getElementById('attendanceRefreshButton').onclick=loadAttendance;document.getElementById('attendanceTable').onclick=event=>{const button=event.target.closest('[data-save-attendance]');if(button)saveAttendance(button)};document.getElementById('attendanceCsv').onclick=async()=>{try{const date=document.getElementById('attendanceDate').value;const data=await api('/reports/attendance?date='+encodeURIComponent(date));window.BelmRecordFiles.csv(data.employees||[],'Attendance-'+date+'.csv')}catch(error){alert(error.message)}};loadAttendance();})();