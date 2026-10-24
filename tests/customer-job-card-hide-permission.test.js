const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../backend/api/customer_portal.php'), 'utf8');
for (const operation of ['hide', 'unhide']) {
  test(`customer ${operation} requires write access and customer isolation`, () => {
    const begin = source.indexOf(`$sub3 === '${operation}' && $method === 'PUT'`);
    assert.ok(begin > 0);
    const end = source.indexOf("if ($sub === 'service-requests'", begin + 10);
    const part = source.slice(begin, end < 0 ? undefined : end);
    assert.match(part, /require_customer_feature_access\(\$customer/);
    assert.match(part, /require_customer_write_access\(\$customer\)/);
    assert.match(part, /UPDATE service_requests SET hidden_at = (?:NOW\(\)|NULL) WHERE id = \? AND customer_id = \?/);
  });
}
