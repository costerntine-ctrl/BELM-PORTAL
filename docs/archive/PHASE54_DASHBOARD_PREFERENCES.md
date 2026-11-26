# Manual login and shared dashboard preferences

- The sign-in form no longer resumes stored sessions or redirects automatically. Autofill keeps the original editable inputs. Continue and Confirm Login remain required.
- Added shared appearance and language settings to 161 HTML/PHP entry pages. The control is available only to authenticated accounts and includes English, Kiswahili and Simplified Chinese.
- A single capture handler owns legacy theme controls, preventing double toggles. Common light/dark CSS and legacy classes now follow the same account preference.
- Theme reads use the active account and cannot overwrite a newer click. Language selectors have unique IDs, stay synchronized, and ignore obsolete responses.
- No backend endpoints, schemas, customer, machine, job-card, invoice or financial records were changed. QR fix db06da1 remains intact.

Validation: all 43 repository tests pass; DOM behavior checks cover admin, technician, customer owner, customer assistant and operator, stale secondary-account tokens, theme toggling, synchronized language selectors, and explicit confirmation with autofilled credentials and an existing saved session. Preference network calls in DOM tests are mocked, not real production logins. Frontend JavaScript syntax checks pass.

Recovery branch: recovery/pre-phase54-432da42.
