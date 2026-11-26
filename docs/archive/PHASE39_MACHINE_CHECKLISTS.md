# Phase 39 — Machine-type-specific checklist seed

An additive, idempotent checklist seeder was added as `backend/scripts/seed_machine_type_checklists.php`.

- Supports Forklift, Excavator, Wheel Loader, Roller, Grader, Bulldozer, Dump Truck, Crane and Reach Stacker.
- Keeps existing active templates unchanged (including the current Reach Stacker master).
- Adds standard shared safety checks plus machine-type-specific items.
- Three per-item responses have GREEN / YELLOW / RED safety grading.
- Does **not** run automatically and has **not** touched production.
- **Requires staging review** by an equipment safety specialist; the checklists are starter templates, not OEM-specific instructions.
- Execute intentionally after normal migrations on staging: `php backend/scripts/seed_machine_type_checklists.php`.
- Verify actual PostgreSQL, existing template variants and browser before production rollout.
