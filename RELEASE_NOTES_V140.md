# BELM Portal V140 — Operations UI Foundation

V140 changes the visible product direction from a collection of admin managers into a connected Service & Operations Platform.

## Visible changes
- Redesigned Admin Operations Control Center.
- Professional card design system with consistent spacing, radius, shadows and status treatment.
- Quick operational actions for Service, Customers/Machines, Stock and Finance.
- Improved machine cards: less oversized, clearer condition emphasis and cleaner status borders.
- Responsive command-center layout.
- New BELM Service & Operations Platform visual identity in the control center.

## Product architecture direction
- Added docs/SYSTEM_BLUEPRINT_V140.md.
- Defines BELM ↔ Customer, Customer ↔ Customer Employees and BELM ↔ BELM Employees collaboration model.
- Establishes the operational chain Service → Approval → Work → Billing → Machine History.

## Local testing
V140 keeps the V138 Docker local-test workflow. Use RUN_LOCAL.bat after Docker Desktop is running.
