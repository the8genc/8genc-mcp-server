-- 004_user_roles.sql — add 'consultant' and 'client' to the user_role enum.
--
-- ISOLATED on purpose: Postgres forbids USING a newly added enum value in the
-- same transaction that adds it. The migrate runner (src/db/migrate.js) wraps
-- each file in one BEGIN/COMMIT, so this file only ADDS the values and never
-- references them — any migration/seed that uses them must live in a later file
-- (a separate transaction). PG 12+ permits ADD VALUE inside a transaction.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'consultant';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'client';
