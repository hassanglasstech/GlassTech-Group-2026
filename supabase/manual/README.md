# Manual / destructive scripts — DO NOT auto-run

These scripts permanently DELETE data and must **never** run as part of the
normal `supabase/migrations/` sequence. They were moved here during the go-live
audit so a migration run can't wipe production.

Each file carries a confirmation guard:
```sql
SET app.confirm_destructive = 'YES_I_UNDERSTAND';
```
Run them **only** intentionally, on the right environment, after a backup.

- `FRESH_START_TRUNCATE_ALL.sql` — truncates all business tables (dev reset).
- `20260523_fresh_users_keep_hassan.sql` — deletes all users except Hassan.
