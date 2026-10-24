const fs = require('node:fs');
const assert = require('node:assert/strict');
const p = fs.readFileSync(require('node:path').join(__dirname,'../backend/api/commercial_master_pdf_helper.php'),'utf8');
assert(p.includes("throw new RuntimeException('qrencode unavailable.')"));
assert(p.includes("' -t XPM -l M -m 4 -o - '"));
assert(p.includes('$payload = $accountName . "\\n" . $bankName'));
assert(!p.includes("pdf_text_center($cardX + 32, $cardY + 30, 'QR'"));
assert(p.includes('is_string($bankKey) && strtoupper(trim($bankKey))'));
console.log('Phase 50 commercial QR: passed');
