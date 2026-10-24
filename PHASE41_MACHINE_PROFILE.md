# Phase 41 — Machine Profile / workflow navigation

Added machine-profile navigation to the existing Shared Machine Card details drawer. The user can open the existing role-authorized Checkup, Job Card, and Report action for that machine. Missing actions are clearly labelled unavailable, rather than inventing maintenance-history data or cross-customer access. The real uploaded machine photo and machine-type-specific checklist logic from phases 38–40 remain unchanged.

Validation: JavaScript syntax checked and repository Node tests run; see /mnt/data/phase41-results.txt. Browser, Postgres, real notifications, and production have not been tested or changed.
