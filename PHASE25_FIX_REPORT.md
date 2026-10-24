# Phase 25 — Fixes to four failing Phase 24 tests
Date: 2026-10-24

## Results
14/14 Node regression test files pass locally. JavaScript syntax checked for shared machine-card. Bank PHP syntax passed.

## Fixes
1. Access Applications: removed sidebar assets, made registration controls visible and keyboard-reachable, provided registration actions accessible label, expanded content width.
2. Machine Cards: excluded disabled and aria-disabled native actions from visible shared actions, so role-disabled controls are not offered.
3. Bank withdrawal test: replaced obsolete inline arithmetic assertion with checks that both endpoints use shared belm_provisional_margin_bridge and that withdrawals are excluded from direct operating-result calculation.
4. Shared Machine Card tests: updated obsolete markup and cache-version assumptions to the active v838/v847 behavior.

## Restrictions
These are source-level regressions and basic syntax checks only, not full browser tests or integration tests against PostgreSQL. No schema migrations or payment operations were performed. GitHub main, staging branch files and Render were not changed during this phase.
