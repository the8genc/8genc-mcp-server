-- 007_drop_client_contexts.sql — retire the per-user data-scope table.
--
-- Data-scope moved to the client tenant in 006 (clients.coda_files/variables/notes,
-- shared by members). The dashboard editor + portal endpoints that wrote
-- client_contexts are removed in the same PR as this migration, so dropping the
-- table here leaves no live reader.

DROP TABLE IF EXISTS client_contexts;
