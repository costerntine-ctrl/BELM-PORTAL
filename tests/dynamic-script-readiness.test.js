const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const targets = [
  "frontend/concept-dashboards/01-admin-home/assets/js/belm-admin-dashboard-core-v808.js",
  "frontend/concept-dashboards/05-inspection-repair/assets/js/jobcard-live-sync.js",
  "frontend/concept-dashboards/08-daily-checklist/assets/js/belm-daily-checklist.js",
];

for (const file of targets) {
  const source = read(file);
  assert.match(source, /document\.readyState\s*===\s*['"]loading['"]/, `${file} must handle loading documents`);
  assert.match(source, /else\s+(?:\{\s*)?[A-Za-z_$][\w$]*\(\)/, `${file} must boot immediately when loaded after DOMContentLoaded`);
}

const checklistHtml = read("frontend/concept-dashboards/08-daily-checklist/index.html");
assert.match(checklistHtml, /createElement\(['"]script['"]\)[\s\S]*belm-daily-checklist\.js/, "daily checklist remains a dynamic role-aware loader");

const inspection = read("frontend/concept-dashboards/05-inspection-repair/assets/js/belm-inspection-repair.js");
assert.match(inspection, /createElement\(['"]script['"]\)[\s\S]*jobcard-live-sync\.js/, "inspection page remains a dynamic live-sync loader");

console.log("Dynamic script readiness contract passed.");
