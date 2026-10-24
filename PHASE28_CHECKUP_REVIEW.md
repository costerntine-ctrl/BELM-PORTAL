# Phase 28 – Customer Machine Check Up permission protection

Fixed customer_checkup.php so a Customer Assistant without an explicit `check-up` permission is denied (403); previously null permissions could bypass the gate. Customer owners remain allowed. Machine queries remain scoped by authenticated customer ID.

Validation: PHP syntax and static Node tests for Phase 26/27/28. This does not establish full live database/browser coverage, and other checklist endpoints remain to be audited.

No modifications to GitHub main, Render, or production database.
