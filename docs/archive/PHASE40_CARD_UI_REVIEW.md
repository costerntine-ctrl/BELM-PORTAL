# Phase 40 — Machine Card responsive presentation

- Shared Machine Card displays a clearly labeled machine type based on known machine category, with an explicit unclassified fallback.
- Actual uploaded machine photos keep `object-fit: contain` in both the photo component and machine summary so equipment is not cropped to fill a thumbnail.
- Smartphone width <=420px uses a single-column action area and readable compact headings; intermediate tablet width has non-overflow action controls.
- Existing customer, technician and operator actions are still delegated through their original controls and permissions; no database change or new authorization is introduced.
- Checklist templates and machine-type matching from Phase 39 remain unchanged.

Validation: JavaScript syntax checks and Node tests. No visual browser screenshots, database tests, or Render deployment have been performed in this phase.
