# Phase 29: Machine Checkup Escalation

- Customer checkup submissions with status YELLOW or RED create a best-effort portal Role Communication addressed to the same customer's Workshop Manager.
- Alerts include machine identity and abnormal checklist findings. RED is URGENT; YELLOW is ATTENTION.
- Editing today's checkup with unchanged severity does not create another alert. GREEN does not create an alert.
- An alert is **not** an assigned job or automatically created Job Card. The manager must review and arrange diagnosis/repair.
- The API returns `requiresManagerReview` and `managerAlertCreated`; the latter can be false if the notification insert fails. Customer checkup saving still succeeds.
- Validation was limited to syntax/static tests; no authenticated browser or PostgreSQL integration test was run.
- The remaining integration work includes verifying notification delivery, role boundaries, and the workflow from manager review into Job Card.
