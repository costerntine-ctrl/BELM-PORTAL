const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const shared = read("frontend/shared-machine-card-v827.js");

for (const selector of [
  ".machine-card",
  ".belm-customer-machine-card",
  ".belm-technician-machine-card",
  ".op-machine-card",
  ".assigned-machine-card",
]) {
  assert.ok(shared.includes(selector), `shared card must cover ${selector}`);
}

assert.match(shared, /belm-shared-actions-open/, "View Details must toggle the action drawer in the same card");
assert.match(shared, /aria-expanded/, "View Details must expose its expanded state");
assert.match(shared, /height:auto!important;min-height:0!important;max-height:none!important/, "shared cards must grow without clipping");
assert.match(shared, /No additional actions are available for this role/, "roles without extra actions need a safe empty state");
assert.doesNotMatch(shared, /belm-shared-detail-open/, "shared cards must not swap back to an older detail-card variant");

for (const file of [
  "frontend/customers-manager/index.html",
  "frontend/operator/index.html",
  "frontend/customer-procurement-home/index.html",
  "frontend/concept-dashboards/02-technician/customer-machines.php",
]) {
  assert.match(read(file), /shared-machine-card-v827\.js\?v=838-unified-actions-scroll/, `${file} must load the shared card`);
}

const loader = read("frontend/runtime-loader-v647.js");
assert.match(loader, /shared-machine-card-v827\.js\?v=838-unified-actions-scroll/, "BELM Admin, Customer and Technician runtime must load the shared card");

const managerCss = read("frontend/customers-manager/manager.css");
assert.match(managerCss, /#machineListDialog \.dialog-card[\s\S]*height: auto !important;[\s\S]*max-height: none !important;[\s\S]*overflow-y: visible !important;/, "machine-list modal must use one vertical scroll owner");

console.log("Shared machine-card and scrolling contract passed.");
