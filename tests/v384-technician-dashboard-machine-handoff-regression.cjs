const fs = require('fs');
const assert = require('assert');
const tools = fs.readFileSync('frontend/portal-tools.js', 'utf8');
const css = fs.readFileSync('frontend/belm-theme.css', 'utf8');

assert(tools.includes('BELM Technician Dashboard'), 'Technician dashboard label missing');
assert(tools.includes('data-technician-view-machines'), 'View Machine control missing');
assert(tools.includes('belm-technician-machine-grid-collapsed'), 'Technician machine grid handoff missing');
assert(tools.includes('new URLSearchParams(window.location.search).get("view") === "machines"'), 'Direct machine view query support missing');
assert(tools.includes('technicianMachineInfoCard(card, machine);'), 'Technician machine card flow was removed');
assert(tools.includes('checkupButton.textContent = "Check Up"'), 'Technician Check-up action missing');
assert(tools.includes('workflowButton.textContent = "Job Card"'), 'Technician Job Cards action missing');
assert(css.includes('.belm-technician-dashboard-card-v384'), 'Technician dashboard card styling missing');
assert(css.includes('.belm-technician-view-machine-button'), 'View Machine styling missing');
console.log('V384 technician dashboard machine handoff regression: PASS');
