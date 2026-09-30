const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const router = read("backend/index.php");
const reports = read("backend/api/reports.php");
const dashboard = read("frontend/dashboard-live-v710.js");

assert.match(
  router,
  /case 'reports': dispatch\('reports\.php',\['action'=>\$segments\[1\]\?\?\(\$_GET\['action'\]\?\?''\)\]\);/,
  "path-style /api/reports/{action} requests must reach reports.php with the requested action",
);
assert.match(reports, /\$action === 'all-overview' && \$method === 'GET'/, "reports API must expose the main overview action");
assert.match(dashboard, /api\("\/reports\/all-overview\?period=month"/, "main dashboard must use the canonical overview route");

console.log("Reports route contract passed.");
