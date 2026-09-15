# BELM Portal System Audit & Cleanup V766

## Scope
Full-system QA pass over the V765 codebase focused on:
- BELM and Customer role boundaries
- operational handoffs / role-to-role communication
- role-based reports
- navigation and canonical entry points
- stale labels / terminology conflicts
- fake/static dashboard values that could be mistaken for live data
- dead action links
- Bank Controller and Spare Sales boundaries
- syntax and route integrity

## Role and permission corrections
- Kept Bank Controller as a protected BELM-only control role.
- Finance / Accounts no longer calls Bank API or shows Bank Accounts / Bank Deposit unless the signed-in user is Super Admin or Bank Controller.
- Customer-side Bank Controller remains unavailable.
- Customer-side BELM Spare Sales / BELM inventory remains unavailable.
- Legacy `Engineer` compatibility is retained internally, but visible wording is normalized to Workshop Manager / Technical Department where it could confuse users.
- Visible `Bank Manager` labels were normalized to `Bank Controller`.

## Work communication chain
Role Communication remains tenant-scoped and now follows the operational chain more closely:
- Technician -> Workshop Manager / Store Keeper
- Store Keeper -> Procurement when stock is unavailable
- Procurement -> Finance / Accounts where payment or proforma action is needed
- Parts ready -> Workshop / Technician
- Operator -> Workshop / assigned technical chain
- Customer messages remain customer-company scoped
- Bank Controller is not exposed to customer communication recipients

Direct Technician -> Procurement role messaging was removed from the default matrix so shortage escalation is owned by Store, matching the workshop process.

## Communication entry points
- Workshop Manager `Communication` now opens `/role-communications/` instead of Customer Overview.
- Portal V2 Workshop Manager communication opens the same shared Role Communication Inbox.
- Existing customer-specific communication history remains available through customer records when needed.

## Role Reports cleanup
- Workshop Manager `Reports & Analysis` entry now opens `/role-reports/`.
- Technician `My Reports` entry now opens `/role-reports/` instead of only the checked-report shortcut.
- Role Reports remains role-filtered; Customer reports do not expose BELM Bank or BELM Spare Sales.

## Workshop Manager dashboard cleanup
- Quick Action wording normalized to `Technician Dispatch`.
- Removed misleading hard-coded initial operational counts; cards start at 0 until live API sync.
- Removed hard-coded date/time placeholder.
- Removed fake tool availability percentages.
- Notification badge now reflects live attention counts from overdue Job Cards, waiting spares and service-due alerts.
- Workshop Status text now reflects live workflow synchronization / attention state.
- Communication and Reports links use the canonical shared modules.

## Registration & Sales bug fixes
The live customer table contained visible actions that were dead `href="#"` links.
They now deep-link into Customers Manager:
- View -> selected customer machines
- Edit -> selected customer edit dialog
- Reset Access -> selected customer login reset flow
- Manage -> selected customer management dialog

Customers Manager now understands the `customer` + `action` deep-link parameters required by those buttons.

## Procurement cleanup
The old supplied Procurement concept dashboard contains static/demo table actions and is not safe as the live operational landing page.
Production role entry now uses the canonical live Procurement workspace:
`/workshop-management-home/?role=procurement`
The concept page remains available only for local/preview visual reference.

## Text cleanup
Normalized user-facing wording including:
- Bank Manager -> Bank Controller
- Engineering -> Technical Department where operational copy was stale
- Engineers -> Workshop Managers in the technical workspace copy
- Open Job Card quick action -> Technician Dispatch where assignment is the intended action

## Validation
- PHP syntax: 80 files PASS
- Frontend JavaScript syntax: 138 files PASS
- Inline JavaScript: 111 scripts PASS
- API top-level route coverage: 50 used segments, 0 missing handlers
- Merge/conflict markers: 0
- Existing V765 Customer Code + Technician assignment gate retained
- No destructive database cleanup added

## Data safety
No DROP/TRUNCATE/business-history deletion was added. Existing customers, machines, Job Cards, reports, finance records, stock history and communications remain intact.
