// BELM Machine Report Center — contextual checklist findings.
// A raw dropdown result such as "Low" is not useful by itself. The Result
// column must preserve the affected checklist item so the report reads
// "Low Brakes oil level", "Hydraulic Oil level: Contaminated", etc.
(function () {
  "use strict";

  const abnormalStates = new Set([
    "low", "high", "contaminated", "leaking", "leak", "damaged", "worn",
    "broken", "loose", "not working", "failed", "dirty", "blocked",
    "overheating", "critical"
  ]);

  function cleanItemLabel(value) {
    return String(value || "")
      .replace(/^\s*\d+\.\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function directResultText(cell) {
    const copy = cell.cloneNode(true);
    copy.querySelectorAll("img,.checkup-issue-note-display").forEach((node) => node.remove());
    return String(copy.textContent || "").replace(/\s+/g, " ").trim();
  }

  function titleState(value) {
    const text = String(value || "").trim();
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  function buildFinding(label, rawValue, level, note) {
    const item = cleanItemLabel(label);
    const value = String(rawValue || "").trim();
    const normalized = value.toLowerCase();
    const safety = String(level || "").toUpperCase();

    if (normalized === "low" || normalized === "high") {
      return `${titleState(value)} ${item}`.trim();
    }
    if (abnormalStates.has(normalized)) {
      const state = normalized === "leak" ? "Leaking" : titleState(value);
      return item ? `${item}: ${state}` : state;
    }
    // "NO" is not automatically a fault (e.g. Engine Alert Code = NO is good).
    // Only turn it into a finding when its safety mapping is YELLOW or RED.
    if (normalized === "no" && (safety === "YELLOW" || safety === "RED")) {
      return item ? `${item}: Not working / NO` : "Not working / NO";
    }
    // Historical rows sometimes have a blank value but a technician issue note.
    if ((!value || value === "—") && note) {
      return item ? `${item}: ${note}` : note;
    }
    return "";
  }

  function enhanceChecklistResults() {
    const body = document.getElementById("reportViewBody");
    const eyebrow = document.getElementById("reportViewEyebrow");
    if (!body || !eyebrow || !/checklist report/i.test(eyebrow.textContent || "")) return;

    const rows = body.querySelectorAll("table tbody tr");
    rows.forEach((row) => {
      if (row.dataset.belmFindingEnhanced === "1") return;
      const cells = row.querySelectorAll(":scope > td");
      if (cells.length < 3) return;

      const item = cleanItemLabel(cells[0].textContent);
      const resultCell = cells[1];
      const statusText = String(cells[2].textContent || "").toUpperCase();
      const level = statusText.includes("RED") ? "RED" : statusText.includes("YELLOW") ? "YELLOW" : statusText.includes("GREEN") ? "GREEN" : "NONE";
      const noteNode = resultCell.querySelector(".checkup-issue-note-display");
      const note = noteNode ? String(noteNode.textContent || "").replace(/^\s*Issue:\s*/i, "").trim() : "";
      const raw = directResultText(resultCell);

      // Photo answers stay as photos; there is no text result to rewrite.
      if (resultCell.querySelector("img")) {
        row.dataset.belmFindingEnhanced = "1";
        return;
      }

      const finding = buildFinding(item, raw, level, note);
      if (finding) {
        const findingNode = document.createElement("strong");
        findingNode.className = `belm-checklist-finding belm-checklist-finding-${level.toLowerCase()}`;
        findingNode.textContent = finding;
        resultCell.innerHTML = "";
        resultCell.appendChild(findingNode);
        if (note && !finding.toLowerCase().includes(note.toLowerCase())) {
          const issue = document.createElement("div");
          issue.className = "checkup-issue-note-display";
          issue.textContent = `Issue: ${note}`;
          resultCell.appendChild(issue);
        }
      }
      row.dataset.belmFindingEnhanced = "1";
    });
  }

  function installStyles() {
    if (document.getElementById("belmChecklistFindingStyles")) return;
    const style = document.createElement("style");
    style.id = "belmChecklistFindingStyles";
    style.textContent = `
      .belm-checklist-finding{display:inline-block;font-weight:800;line-height:1.35;letter-spacing:.01em}
      .belm-checklist-finding-red{color:#ff8176}
      .belm-checklist-finding-yellow{color:#ffd166}
      .belm-checklist-finding-green{color:inherit}
      html:not([data-theme="dark"]) .belm-checklist-finding-red{color:#b42318}
      html:not([data-theme="dark"]) .belm-checklist-finding-yellow{color:#946200}
    `;
    document.head.appendChild(style);
  }

  function boot() {
    installStyles();
    const body = document.getElementById("reportViewBody");
    if (!body) return;
    enhanceChecklistResults();
    const observer = new MutationObserver(() => enhanceChecklistResults());
    observer.observe(body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
