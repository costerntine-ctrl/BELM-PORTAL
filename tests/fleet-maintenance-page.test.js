const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('frontend/customers-manager/manager.js', 'utf8');
const start = source.indexOf('  const pageParams = ');
const end = source.indexOf('  let currentMachineListCustomerName', start);

function mount(search, customers, isTechnicianRole = false, query = '') {
  const elements = {
    customerGrid: { innerHTML: '', addEventListener() {} },
    machineMaintenancePage: { innerHTML: '' },
    searchInput: { value: query },
    statusFilter: { value: '' },
  };
  const context = {
    location: { search }, URLSearchParams, customers, isTechnicianRole,
    embeddedInBelmWorkshop: false,
    currentMachineListCustomerName: '',
    document: { getElementById: id => elements[id] },
    setInterval() {},
    escapeHtml: value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    formatDateTime: value => value,
    statusLabel: value => value,
  };
  vm.runInNewContext(source.slice(start, end) + '\nrenderCustomers();', context);
  return elements;
}

const company = {
  id: 'customer-a', name: 'Company A', isActive: 1, belmServiceProviderActive: true,
  machines: [
    { id: 'm1', model: 'Forklift', fleetNumber: 'FL-1', machineType: 'Forklift', recentOperatorReports: [
      { message: 'Oil checked' }, { message: 'Tyres inspected' },
    ] },
    { id: 'm2', model: 'Stacker', fleetNumber: 'RS-2', machineType: 'Reach Stacker' },
  ],
};

test('fleet lists individual machines and searches by the selected machine', () => {
  const html = mount('', [company]).customerGrid.innerHTML;
  assert.equal((html.match(/class="fleet-machine-card"/g) || []).length, 2);
  assert.match(html, /view=maintenance&machine=m1/);
  assert.match(html, /view=maintenance&machine=m2/);
  assert.match(html, /Tyres inspected/);
  assert.match(html, /data-fleet-report-pause/);
  assert.doesNotMatch(html, /Manage Customer|View Customer Machine/);
  assert.doesNotMatch(mount('', [company], false, 'RS-2').customerGrid.innerHTML, /machine=m1/);
});

test('maintenance route scopes actions to its machine and respects account access', () => {
  const html = mount('?view=maintenance&machine=m1', [company]).machineMaintenancePage.innerHTML;
  for (const label of ['Machine Check-up', 'Job Card', 'Report History', 'Machine Parts', 'Edit Machine', 'Delete Machine', 'Normal', 'On Maintenance', 'Out of Operation (Grounded)']) {
    assert.ok(html.includes(label), label);
  }
  assert.match(html, /data-operational-status="m1"/);
  assert.doesNotMatch(html, /Stacker|m2/);
  const technician = mount('?view=maintenance&machine=m1', [company], true).machineMaintenancePage.innerHTML;
  assert.doesNotMatch(technician, /Edit Machine|Delete Machine/);
  assert.match(mount('?view=maintenance&machine=other', [company]).machineMaintenancePage.innerHTML, /Machine unavailable/);
});

test('restricted machine reports do not enter the fleet card markup', () => {
  const privateCompany = { ...company, machines: [{ ...company.machines[0], privacyMaintenanceAccess: false }] };
  const html = mount('', [privateCompany]).customerGrid.innerHTML;
  assert.match(html, /Reports restricted/);
  assert.doesNotMatch(html, /Oil checked|Tyres inspected/);
});
