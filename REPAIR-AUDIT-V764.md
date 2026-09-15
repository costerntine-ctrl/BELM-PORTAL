# BELM Portal V764 - Technician Customer Machine Flow

## Scope
Reduced unnecessary navigation steps before a Technician reaches an assigned Customer Machine card.

## Previous flow
Technician Dashboard -> Customer Machines -> Customer summary card -> View Machine -> Machine Card.

## V764 flow
Technician Dashboard -> Customer Machines -> Machine Card(s).

## Changes
- Customer Machines page now renders assigned Machine Card(s) immediately.
- Removed the extra `View Machine` reveal step and hidden machine panel.
- Removed the redundant `Back to Customer` step inside the same page.
- Customer identity/contact/communication summary remains visible above the machine cards.
- Portal V2 `Customer Machines` now opens the actual technician customer-machines page instead of the generic technician-tasks page.
- Portal V2 `Communication` now opens the technician communication page directly.
- `/tech` alternate customer-machine view allows clicking the machine summary card itself to open the full Machine Card.
- Existing Machine Card actions (Check Up, Job Card, Reports) are preserved.

## Validation
- PHP syntax: PASS (`customer-machines.php`)
- Inline JavaScript syntax: PASS
- `portal-v2/portal.js`: PASS
- `technician-customer-home-v659.js`: PASS
- No remaining hidden `customerMachinePanel` flow or `viewAssignedMachines` trigger in the Technician Customer Machines page.
