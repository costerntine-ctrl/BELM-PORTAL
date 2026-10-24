# Phase 32 — Checkup to Manager Review to Job Card

- Customer assistant workflow access now fails closed when permissions are absent. Customer owners retain access.
- Repeated escalation of the same checkup into the same open case does not append duplicate case history events; the machine row lock serializes competing requests.
- Existing case/Job Card reuse is retained, and technicians do not gain escalation authority.
- Node code checks: 19/19 passed (includes new security regression test). PHP and manager JavaScript syntax checks passed.
- Not yet tested: authenticated end-to-end browser workflow or PostgreSQL integration under concurrency; no changes to production or GitHub main.
