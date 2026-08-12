# BELM Operations Platform — V140 Blueprint

## Purpose
BELM Portal is an operational collaboration system connecting:
1. BELM with customers.
2. Customers with their own employees.
3. BELM with BELM employees.

## Primary workflow
Customer reports issue → BELM reviews → job is assigned → technician inspects → approval/parts are handled → repair/service is completed → customer signs off → billing is prepared → machine history is updated.

## Role model
### BELM
- Super Admin / Management
- Service Manager
- Technician / Engineer
- Store / Spare Parts
- Finance
- Other authorized staff

### Customer organization
- Customer Admin / Manager
- Maintenance / Site Supervisor
- Machine Operator
- Finance / Accounts
- Other authorized employees

Permissions should control what each role can see and approve.

## Core operational objects
Organization → Users → Sites → Machines → Service Jobs → Inspection/Checklist → Parts → Approval → Work → Sign-off → Billing → History.

## Navigation direction
- Command Center
- Operations
- Customers & Machines
- People
- Parts & Stock
- Finance
- Reports
- System

## Design rules
- Important data is shown in cards only when a card helps a decision.
- Status is visible by text + restrained colour, never colour alone.
- Critical jobs and approvals are surfaced before secondary statistics.
- Technician mobile screens prioritize today's work, machine information, checklist, photos, parts and sign-off.
- Customer screens prioritize fleet status, service requests, approvals, documents and finance.
- Every completed service job should create a machine-history entry and financial trail.
