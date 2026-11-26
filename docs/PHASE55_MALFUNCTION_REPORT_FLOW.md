# Phase 55 - Machine Malfunction Report -> Job Card -> Maintenance Report

Flow (BELM Portal and Customer Portal, same code, scoped by workshop owner):

1. Daily check-up is submitted and saved in the daily checklist report as before.
2. Every machine card has a **Report It** button (Technician, Machine Operator, Customer Workshop). The user writes the problem; it is saved in `machine_malfunction_reports` and the Workshop Manager gets an URGENT role-communication alert.
3. Workshop Manager opens **Malfunction Reports**, picks a Technician, writes the job description and creates the Job Card (breakdown case + `digital_job_cards` + `WORKSHOP_MANAGER_INSTRUCTION` event).
4. The Technician works the 5 steps: Initial inspection, Findings report, Solution, Pending (a reason is required and shown), Solved.
5. **Solved** completes the Job Card (`FINAL RESULT: OK`), so it appears in Completed Maintenance Reports, marks the report RESOLVED and deletes its alert notices.

Ownership: provider-ON customers (`is_machinery_admin=0`) -> BELM Workshop Manager and BELM Technicians; provider-OFF customers -> the customer's own Workshop Manager and customer-managed Technicians.

Also in this package: `saved_reports` table, `saved-reports.php` / `save-report.php` fixes, Job Card detail workshop boundary, CI php 8.3.

Not yet verified against a live PostgreSQL database.

## Phase 56 - role pages (Technician and Workshop Manager)

`/malfunction-reports/?view=...&actor=admin|technician|customer` - one page per menu, each with ONE sidebar (the global persistent sidebar is switched off on this page) and a Back button:
- Technician: dashboard, machines (My Machines), jobs (assigned / in_progress / pending / completed / history), job (5 steps with Save Draft and Update Progress).
- Workshop Manager: dashboard, machines, technicians, assignments, machine-reports, jobs, create (Create Job Card with machine, technician, priority, description).

Rules: a Technician sees only machines assigned to him (`machine_technician_assignments`, or an open Job Card for him); the server enforces this. Nothing is deleted: assignments get `ended_at`, a resolved Pending reason gets `resolved_at`, Solved alerts get `role_communications.archived_at`.
Limit: legacy Technician pages outside this module (`/tech`, customer technician pages) keep their existing machine scope.

## Phase 57 - menu and dashboard follow the workflow image
Menu: Dashboard, Machines, Daily Check List Report, Machine Malfunctioning Report, Job Card, Maintenance Report, Alerts (with count). Dashboard: machine cards (Operational / Under Repair / In Maintenance, assigned Technician, Report It, status filter), Technician Summary, Alerts, Workflow. Tested end-to-end against PostgreSQL 16 (assign, report, create Job Card, draft, pending, solved, completed report, archived alerts).

## Phase 58 - core reports and report centre layout
Core reports now use the workflow names everywhere: Daily Check List Report, Machine Malfunctioning Report, Job Card Reports/Records, Maintenance Report (solved Job Cards). The older technician service-work page is "Maintenance Work Report". General Report: readable header and hero in the light theme, no overlap with the Back button, two-column department list, "1 report / n reports" wording.

## Phase 59 - dashboard matches the workflow image
Banner, BELM Portal / Customer Portal switch with info box, machine cards with photo, Technician Summary, Workflow, Create Job Card panel (works from the dashboard) and Alerts with the "after solved" note. The photo is `frontend/malfunction-reports/machine-default.webp` (default for every machine until per-machine photos exist).
