# Security Notes

## Before production use

- Rotate the bootstrap Administrator password.
- Change the bootstrap delete PIN.
- Keep `JWT_SECRET` long, random and private.
- Configure HTTPS only for production portal traffic.
- Restrict `ALLOWED_ORIGINS` to trusted BELM domains.
- Use an SMTP App Password/API-specific credential, not a personal mailbox password.
- Do not expose database credentials in screenshots, logs or client-side JavaScript.

## Destructive operations

Database reset/delete features are administrative tools. They must remain behind authenticated Super Admin checks and confirmation controls. Do not expose them as public routes or remove the password/PIN/reason checks.

## Token handling

The portal uses JWT bearer tokens. Treat copied URLs containing `token=` as credentials because some authenticated file/download flows support token query fallback.
