# BELM Portal V137 Professional Baseline

## What changed

- Preserved all V136 portal modules and runtime paths.
- Fixed Administrator health-check identity mismatch: health now checks the same seeded Administrator email used by the schema.
- Removed stale Administrator email/password text from the database-reset success response.
- Added a professional root `README.md`.
- Added `.env.example` for local/deployment configuration.
- Added functional scope documentation.
- Added architecture and engineering rules.
- Added Render deployment/runbook documentation.
- Added security notes for credentials, JWT, SMTP and destructive operations.
- Added `scripts/qa.sh` release-quality checks.
- Verified all 33 backend PHP files with `php -l`.
- Verified non-bundled frontend JavaScript manager files with `node --check`.

## Recommended next development rule

Treat this V137 package as the baseline. Future changes should be implemented as named features/releases against this baseline rather than creating parallel copies of the portal.
