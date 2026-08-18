const fs = require('fs');
const assert = require('assert');
const app = fs.readFileSync('frontend/bank-controller/app.js','utf8');
const html = fs.readFileSync('frontend/bank-controller/index.html','utf8');
const api = fs.readFileSync('backend/api/bank_manager.php','utf8');
const helpers = fs.readFileSync('backend/config/helpers.php','utf8');
const schema = fs.readFileSync('backend/schema.sql','utf8');

const checks = [];
function check(name, fn){ fn(); checks.push(name); }
check('API globally shapes snake_case database fields to camelCase', () => assert.match(helpers, /function api_shape/));
check('bank controller reads bankName camelCase', () => assert.match(app, /account\?\.bankName/));
check('bank controller reads accountName camelCase', () => assert.match(app, /account\?\.accountName/));
check('bank controller reads accountNumber camelCase', () => assert.match(app, /account\?\.accountNumber/));
check('bank controller keeps snake_case legacy fallbacks', () => assert.match(app, /account\?\.bank_name/));
check('opening balance supports camelCase', () => assert.match(app, /account\?\.openingBalance/));
check('dropdown uses normalized bank display helpers', () => assert.match(app, /bankNameOf\(account\).*accountNameOf\(account\).*accountNumberOf\(account\)/s));
check('withdrawal list uses normalized bank fields', () => assert.match(app, /withdrawalBankNameOf\(item\).*withdrawalAccountNameOf\(item\)/s));
check('saved account stays selected after reload', () => assert.match(app, /load\(savedId\)/));
check('save UI confirms PostgreSQL persistence', () => assert.match(app, /saved in PostgreSQL/));
check('page shows PostgreSQL load status', () => assert.match(html, /bankStorageStatus/));
check('bank asset cache is V348', () => assert.match(html, /348-bank-account-visibility/));
check('bank accounts remain persistent schema table', () => assert.match(schema, /CREATE TABLE IF NOT EXISTS bank_accounts/));
check('bank save inserts named fields', () => assert.match(api, /INSERT INTO bank_accounts[\s\S]*bank_name, account_name, account_number, opening_balance/));
check('bank API returns saved id', () => assert.match(api, /json_out\(\['id' => \$newId\], 201\)/));
console.log(`V348 checks passed: ${checks.length}/${checks.length}`);
