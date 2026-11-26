# Phase 53 — BELM Portal language foundation

- Incorporated Phase 52 preference endpoint and language selectors into the complete project copy.
- Added one shared EN/SW/ZH interface dictionary with 109 exact-label translations.
- Loaded language preferences + shared interface dictionary on 159 HTML entry pages.
- Dynamic navigation/buttons/headings/labels/headers/options are translated on page load and when preference changes. User-entered contents, invoice totals, machine IDs and stored texts are excluded.
- English is fallback for missing translations. **Not a complete translation of 160 screens**: paragraphs, JavaScript alerts, server-generated PDF reports, notifications and technical checklist item descriptions still require review and localization.
- Preference endpoint uses additive PostgreSQL schema update. Needs testing on staging/production database before release.
- This copy is **not deployed**.
