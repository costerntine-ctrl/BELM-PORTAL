# Production Deployment - Render

## Prerequisites

- Git repository containing this project at repository root.
- Render account.
- Domain DNS control for `portal.belmgeneraltech.co.tz` when using the custom domain.

## Deploy

1. Push the repository with `Dockerfile` and `render.yaml` at the root.
2. In Render, create a **Blueprint** from the repository.
3. Apply the Blueprint. It provisions:
   - `belm-portal` web service
   - `belm-portal-db` PostgreSQL database
4. Verify the service is Live.
5. Open `/api/health` and confirm `ok`, `schemaReady` and `adminReady` are true.
6. Sign in using the configured/bootstrap Administrator account.
7. Immediately change the bootstrap password and delete PIN.
8. Configure SMTP variables if email delivery is required.
9. Test each user path: Admin, Technician, Customer and registration approval.

## Environment variables

Render already provisions `DATABASE_URL` and `JWT_SECRET` from `render.yaml`. SMTP values are intentionally blank until configured.

Never put real SMTP passwords or other secrets into `.env.example`, README files or Git commits.

## Release verification

Run:

```bash
./scripts/qa.sh
```

Then manually verify:

- `/api/health`
- Administrator login
- Registration -> approval -> generated login workflow
- Customer login and machine cards
- Technician login and assigned customer/machines
- Service request creation and admin assignment
- Checklist completion/photo evidence
- Inventory request lifecycle
- Invoice/payment/receipt workflow
- Reports and settings access

## Rollback

Use Render's previous successful deployment when the failure is application-code related. For database changes, avoid destructive rollback commands; use a database backup/restore plan and test schema changes before production.
