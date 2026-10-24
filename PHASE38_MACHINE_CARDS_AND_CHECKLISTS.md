# Phase 38 — Machine Cards & Checklists

- Shared machine cards retain the actual uploaded photo; when absent, show a labelled type pictogram rather than an incorrect stock photograph.
- Type recognition covers reach stackers, forklifts, excavators, wheel loaders, graders, rollers, bulldozers, dump trucks, trucks, cranes, generators and compressors. Unknown types show a neutral placeholder.
- Customer checkup template matching now requires an exact normalized machine type when one is recorded; model-name fallback is permitted only where machine_type is blank. Unmatched types show the existing `Checklist Template not synced` error, rather than a potentially unsafe checklist.
- No database records are changed. Test with actual machine types and checklist master templates before deployment.
- Accurate photographs must be uploaded by authorized users; type pictograms are not photographs.
