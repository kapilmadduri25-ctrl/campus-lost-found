-- ============================================================================
--  Row Level Security (optional, Supabase only)
--
--  The Express API connects as the database owner and therefore bypasses RLS.
--  Enabling RLS with NO policies means the public "anon" key that ships in a
--  browser can read nothing at all — the API stays the only door to the data.
--  Run this after schema.sql if you ever expose the Supabase URL publicly.
-- ============================================================================

alter table users         enable row level security;
alter table items         enable row level security;
alter table claims        enable row level security;
alter table notifications enable row level security;
alter table audit_logs    enable row level security;

-- No policies on purpose: deny by default for anon / authenticated keys.
-- The service connection used by Express is the table owner, so it still works.
