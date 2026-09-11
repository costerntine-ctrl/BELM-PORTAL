# BELM Operations Portal

Production source for the BELM Operations Portal.

## Runtime
- `frontend/` - portal UI and role workspaces
- `backend/` - PHP APIs, migrations and database logic
- `docker/` - Apache/PHP Render startup configuration
- `Dockerfile` - production container
- `render.yaml` - Render service/database blueprint

## CI
- `validate.yml` checks PHP syntax, JavaScript syntax and local static asset references.
- `export-zip.yml` creates a short-lived source export artifact from `main`.

Temporary release patches, base64 transport chunks and materialization staging files must not be committed to `main`.
