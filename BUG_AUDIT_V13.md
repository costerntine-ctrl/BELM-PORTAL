# BELM Portal Bug Audit V13

## Fixed
- Fixed broken Portal-CWM stylesheet reference from missing `/portal-cwm/machine-alert-zone-v611.css` to existing `/machine-alert-zone-v612.css`.

## Verified
- 54 PHP files pass `php -l`.
- 75 JavaScript files pass `node --check`.
- No missing local HTML `src`/`href` assets after the fix.
- `backend/schema.sql` contains no deployment-time `DROP TABLE`, `TRUNCATE`, or `DELETE FROM` statements.
- Coordinator department state remains additive (`ENABLED`/`REMOVED`) and does not delete operational history.
- Customer private sales documents remain scoped by `customer_id`.
- Communication settings persist through `system_settings` UPSERT.

## Audit note
- `backend/api/contracts.php` and `backend/api/workshops.php` reference legacy/future workshop tables that are not currently routed by `backend/index.php`; they are therefore not active API surfaces in this build. They should not be exposed until their schema is formally added and migrated.
