# BELM Portal — Phase 24 integration review
Date: 2026-10-24

## Scope
Source review and local automated test execution on the Phase 23 ZIP; no database/API live integration test conducted.

## Verification
- Node.js tests: 10 passed / 4 failed (14 test files).
- PHP lint: 91 backend PHP files passed syntax check.
- GitHub staging branch created: `review/phase24-integration`, based on `b9d49219d7d054ff500192f261195cbfa87c731e`.
- No source files have been pushed to the staging branch yet. Main branch, Render and live database untouched.

## Failed tests (do not assume root cause without investigation)
- `tests/bank-withdrawal-is-not-profit.test.js`: assertion expects a direct `$netAfterVat` formula; code now delegates accounting to `finance_reconciliation_helper.php`. Reassess test against current business rules, then test real accounting scenarios.
- `tests/admin-applications-no-sidebar.test.js`: Access Applications page violates the no-global-sidebar assertion.
- `tests/machine-card-details-toggle.test.js`: shared machine card Report action count differs from test expectation.
- `tests/shared-machine-card.test.js`: customers-manager page fails shared-card inclusion assertion.

## Pending before merge/deployment
1. Investigate four failed tests and repair code or outdated assertions with evidence.
2. Compare all Phase 23 modified files against GitHub main and inspect security impacts.
3. Exercise Customer/BELM role-based authorization and notifications with a disposable PostgreSQL database.
4. Exercise invoice/payment/VAT/withdrawal ledger scenarios and migrations with sample data.
5. Only then commit reviewed changes to staging branch and deploy to separate Render staging service.
